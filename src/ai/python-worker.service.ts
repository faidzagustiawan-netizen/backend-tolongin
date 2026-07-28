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

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RESTARTS = 10;
const RESTART_BASE_DELAY_MS = 1_000;

/**
 * Satu kelompok proses Python yang menjalankan skrip yang sama.
 *
 * Pemisahan per skrip bukan sekadar kerapian. EasyOCR berjalan di atas PyTorch
 * sedangkan DeepFace di atas TensorFlow; keduanya membawa runtime OpenMP/MKL
 * sendiri, dan memuatnya dalam satu proses membuat proses itu mati dengan
 * SIGSEGV di tengah permintaan. Setiap framework karena itu mendapat pool
 * sendiri, sehingga manfaat "model dimuat sekali" tetap didapat tanpa
 * menyatukan dua runtime yang berkonflik.
 */
class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly queue: QueuedJob[] = [];
  private shuttingDown = false;

  constructor(
    private readonly name: string,
    private readonly scriptPath: string,
    private readonly size: number,
    private readonly pythonCmd: string,
    private readonly logger: Logger,
  ) {}

  start() {
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker();
      this.workers.push(worker);
      this.spawnWorker(worker, i);
    }
    this.logger.log(
      `Pool "${this.name}" dijalankan dengan ${this.size} proses.`,
    );
  }

  stop() {
    this.shuttingDown = true;
    for (const worker of this.workers) {
      worker.process?.kill();
    }
  }

  private spawnWorker(worker: Worker, index: number) {
    if (this.shuttingDown) return;

    const child = spawn(this.pythonCmd, [this.scriptPath], {
      env: {
        ...process.env,
        CUDA_VISIBLE_DEVICES: '-1',
        TF_CPP_MIN_LOG_LEVEL: '3',
        KMP_DUPLICATE_LIB_OK: 'TRUE',
        PYTHONUNBUFFERED: '1',
        // Keluaran pustaka memuat karakter non-ASCII (bilah kemajuan EasyOCR).
        // Tanpa ini, lingkungan yang encoding bawaannya bukan UTF-8 melempar
        // UnicodeEncodeError saat pesan tersebut ditulis.
        PYTHONIOENCODING: 'utf-8',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    worker.process = child;
    worker.ready = false;
    worker.busy = false;

    const rl = readline.createInterface({ input: child.stdout! });
    rl.on('line', (line) => this.handleLine(worker, index, line));

    child.stderr!.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) this.logger.debug(`${this.name}#${index}: ${text}`);
    });

    child.on('exit', (code, signal) => {
      rl.close();
      worker.ready = false;
      worker.process = null;

      if (worker.pending) {
        clearTimeout(worker.pending.timer);
        worker.pending.reject(
          new Error(
            `Proses worker "${this.name}" berhenti (code ${code}, signal ${signal}) saat permintaan berjalan.`,
          ),
        );
        worker.pending = null;
      }
      worker.busy = false;

      if (this.shuttingDown) return;

      worker.restarts += 1;
      if (worker.restarts > MAX_RESTARTS) {
        this.logger.error(
          `${this.name}#${index} melewati batas ${MAX_RESTARTS} kali restart; tidak dijalankan ulang. ` +
            'Periksa dependensi Python di lingkungan ini.',
        );
        this.drainQueueWithError(
          new Error(`Layanan "${this.name}" tidak tersedia.`),
        );
        return;
      }

      const delay = RESTART_BASE_DELAY_MS * worker.restarts;
      this.logger.warn(
        `${this.name}#${index} berhenti (code ${code}, signal ${signal}). Dijalankan ulang dalam ${delay}ms.`,
      );
      setTimeout(() => this.spawnWorker(worker, index), delay);
    });

    child.on('error', (error) => {
      this.logger.error(
        `${this.name}#${index} gagal dijalankan: ${error.message}`,
      );
    });
  }

  private handleLine(worker: Worker, index: number, line: string) {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      this.logger.debug(`${this.name}#${index} keluaran non-JSON: ${line}`);
      return;
    }

    if (message.id === '__ready__') {
      worker.ready = true;
      worker.restarts = 0;
      this.logger.log(`${this.name}#${index} siap melayani permintaan.`);
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
      pending.reject(new Error(message.error || 'Galat worker Python'));
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
      this.dispatch(worker, this.queue.shift()!);
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
          `Permintaan "${job.op}" melewati batas ${job.timeoutMs}ms.`,
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

  call<T>(op: string, payload: unknown, timeoutMs: number): Promise<T> {
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

/** Operasi dipetakan ke pool yang menjalankan framework yang sesuai. */
const OP_ROUTING: Record<string, 'face' | 'ocr'> = {
  verify_face: 'face',
  verify_ktp: 'ocr',
};

@Injectable()
export class PythonWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PythonWorkerService.name);
  private readonly pools = new Map<string, WorkerPool>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const pythonCmd =
      this.configService.get<string>('PYTHON_BIN') ||
      (process.platform === 'win32' ? 'python' : 'python3');

    const scriptDir = path.resolve(process.cwd(), 'src/ai/python');

    // Pengawasan berkelanjutan memanggil pencocokan wajah tiap 30 detik per
    // kandidat, jadi pool wajah butuh lebih dari satu proses. OCR KTP hanya
    // dipanggil saat pendaftaran identitas, sehingga satu proses memadai dan
    // menghemat memori — tiap proses menahan bobot modelnya sendiri.
    const facePoolSize = Math.max(
      1,
      Number(this.configService.get<string>('FACE_WORKER_POOL_SIZE')) || 2,
    );
    const ocrPoolSize = Math.max(
      1,
      Number(this.configService.get<string>('OCR_WORKER_POOL_SIZE')) || 1,
    );

    this.pools.set(
      'face',
      new WorkerPool(
        'face',
        path.join(scriptDir, 'face_worker.py'),
        facePoolSize,
        pythonCmd,
        this.logger,
      ),
    );
    this.pools.set(
      'ocr',
      new WorkerPool(
        'ocr',
        path.join(scriptDir, 'ocr_worker.py'),
        ocrPoolSize,
        pythonCmd,
        this.logger,
      ),
    );

    for (const pool of this.pools.values()) {
      pool.start();
    }
  }

  onModuleDestroy() {
    for (const pool of this.pools.values()) {
      pool.stop();
    }
  }

  /**
   * Menjalankan satu operasi di pool yang sesuai.
   * Bila semua proses sibuk, permintaan mengantre sampai ada yang luang.
   */
  call<T = any>(
    op: string,
    payload: unknown,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    const poolName = OP_ROUTING[op];
    if (!poolName) {
      return Promise.reject(new Error(`Operasi tidak dikenal: ${op}`));
    }

    const pool = this.pools.get(poolName);
    if (!pool) {
      return Promise.reject(
        new Error(`Pool "${poolName}" belum dijalankan.`),
      );
    }

    return pool.call<T>(op, payload, timeoutMs);
  }
}
