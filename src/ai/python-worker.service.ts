import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as readline from 'readline';
import { randomUUID } from 'crypto';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface QueuedJob {
  op: string;
  payload: unknown;
  timeoutMs: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

class Worker {
  process: ChildProcess | null = null;
  ready = false;
  busy = false;
  pending: PendingRequest | null = null;
  restarts = 0;
}

const DEFAULT_POOL_SIZE = 2;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RESTARTS = 10;
const RESTART_BASE_DELAY_MS = 1_000;

/**
 * Pool proses Python yang berumur panjang untuk pekerjaan biometrik.
 *
 * Sebelumnya setiap verifikasi menjalankan `python verify_face.py` sebagai
 * proses baru, sehingga TensorFlow, bobot Facenet, dan model EasyOCR dimuat
 * ulang setiap panggilan. Pengawasan berkelanjutan memanggil verifikasi tiap
 * 30 detik per kandidat, jadi biaya pemuatan itu menumpuk sampai tidak
 * sanggup dilayani begitu ada beberapa peserta bersamaan.
 *
 * Di sini prosesnya dijaga tetap hidup: model dimuat sekali, lalu permintaan
 * dilayani lewat JSON baris-per-baris di stdin/stdout. Satu proses melayani
 * satu permintaan pada satu waktu, dan paralelisme diperoleh dari jumlah
 * anggota pool.
 */
@Injectable()
export class PythonWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PythonWorkerService.name);
  private readonly workers: Worker[] = [];
  private readonly queue: QueuedJob[] = [];
  private readonly poolSize: number;
  private readonly scriptPath: string;
  private readonly pythonCmd: string;
  private shuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    this.poolSize = Math.max(
      1,
      Number(this.configService.get<string>('FACE_WORKER_POOL_SIZE')) ||
        DEFAULT_POOL_SIZE,
    );
    this.pythonCmd =
      this.configService.get<string>('PYTHON_BIN') ||
      (process.platform === 'win32' ? 'python' : 'python3');
    this.scriptPath = path.resolve(
      process.cwd(),
      'src/ai/python/face_worker.py',
    );
  }

  onModuleInit() {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker();
      this.workers.push(worker);
      this.startWorker(worker, i);
    }
    this.logger.log(
      `Pool worker biometrik dijalankan dengan ${this.poolSize} proses.`,
    );
  }

  onModuleDestroy() {
    this.shuttingDown = true;
    for (const worker of this.workers) {
      worker.process?.kill();
    }
  }

  private startWorker(worker: Worker, index: number) {
    if (this.shuttingDown) return;

    const child = spawn(this.pythonCmd, [this.scriptPath], {
      env: {
        ...process.env,
        CUDA_VISIBLE_DEVICES: '-1',
        TF_CPP_MIN_LOG_LEVEL: '3',
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    worker.process = child;
    worker.ready = false;
    worker.busy = false;

    const rl = readline.createInterface({ input: child.stdout! });
    rl.on('line', (line) => this.handleLine(worker, index, line));

    // Worker menulis log dan seluruh keluaran pustaka ke stderr; hanya
    // dicatat pada level debug agar tidak membanjiri log aplikasi.
    child.stderr!.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) this.logger.debug(`worker#${index}: ${text}`);
    });

    child.on('exit', (code, signal) => {
      rl.close();
      worker.ready = false;
      worker.process = null;

      // Permintaan yang sedang berjalan tidak akan pernah dijawab.
      if (worker.pending) {
        clearTimeout(worker.pending.timer);
        worker.pending.reject(
          new Error(
            `Proses worker biometrik berhenti (code ${code}, signal ${signal}) saat permintaan berjalan.`,
          ),
        );
        worker.pending = null;
      }
      worker.busy = false;

      if (this.shuttingDown) return;

      worker.restarts += 1;
      if (worker.restarts > MAX_RESTARTS) {
        this.logger.error(
          `worker#${index} melewati batas ${MAX_RESTARTS} kali restart; tidak dijalankan ulang. ` +
            'Periksa dependensi Python (deepface, easyocr) di lingkungan ini.',
        );
        this.drainQueueWithError(
          new Error('Layanan biometrik tidak tersedia.'),
        );
        return;
      }

      const delay = RESTART_BASE_DELAY_MS * worker.restarts;
      this.logger.warn(
        `worker#${index} berhenti (code ${code}). Dijalankan ulang dalam ${delay}ms.`,
      );
      setTimeout(() => this.startWorker(worker, index), delay);
    });

    child.on('error', (error) => {
      this.logger.error(`worker#${index} gagal dijalankan: ${error.message}`);
    });
  }

  private handleLine(worker: Worker, index: number, line: string) {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      // Baris yang bukan JSON berarti ada pustaka yang lolos ke stdout.
      // Diabaikan agar protokol tidak ikut rusak.
      this.logger.debug(`worker#${index} keluaran non-JSON: ${line}`);
      return;
    }

    if (message.id === '__ready__') {
      worker.ready = true;
      worker.restarts = 0;
      this.logger.log(`worker#${index} siap melayani permintaan.`);
      this.drainQueue();
      return;
    }

    const pending = worker.pending;
    if (!pending) return;

    clearTimeout(pending.timer);
    worker.pending = null;
    worker.busy = false;

    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error || 'Galat worker biometrik'));
    }

    this.drainQueue();
  }

  private pickIdleWorker(): Worker | undefined {
    return this.workers.find((w) => w.ready && !w.busy && w.process);
  }

  private drainQueue() {
    while (this.queue.length > 0) {
      const worker = this.pickIdleWorker();
      if (!worker) return;

      const job = this.queue.shift()!;
      this.dispatch(worker, job);
    }
  }

  private drainQueueWithError(error: Error) {
    while (this.queue.length > 0) {
      this.queue.shift()!.reject(error);
    }
  }

  private dispatch(worker: Worker, job: QueuedJob) {
    const id = randomUUID();
    worker.busy = true;

    const timer = setTimeout(() => {
      worker.pending = null;
      worker.busy = false;
      // Worker mungkin macet di tengah inferensi; dimatikan agar penjaga
      // `exit` menjalankannya ulang dengan keadaan bersih.
      worker.process?.kill();
      job.reject(
        new Error(
          `Permintaan biometrik "${job.op}" melewati batas ${job.timeoutMs}ms.`,
        ),
      );
    }, job.timeoutMs);

    worker.pending = { resolve: job.resolve, reject: job.reject, timer };

    try {
      worker.process!.stdin!.write(
        JSON.stringify({ id, op: job.op, payload: job.payload }) + '\n',
      );
    } catch (error: any) {
      clearTimeout(timer);
      worker.pending = null;
      worker.busy = false;
      job.reject(new Error(`Gagal mengirim ke worker: ${error.message}`));
    }
  }

  /**
   * Menjalankan satu operasi di worker yang tersedia.
   * Bila semua sibuk, permintaan mengantre sampai ada yang luang.
   */
  call<T = any>(
    op: string,
    payload: unknown,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.shuttingDown) {
        reject(new Error('Layanan sedang dimatikan.'));
        return;
      }

      const job: QueuedJob = { op, payload, timeoutMs, resolve, reject };
      const worker = this.pickIdleWorker();

      if (worker) {
        this.dispatch(worker, job);
      } else {
        this.queue.push(job);
      }
    });
  }
}
