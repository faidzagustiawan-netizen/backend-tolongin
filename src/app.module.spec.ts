import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { SeedService } from './seed/seed.service';
import { terapkanFakeEnv } from './common/testing/fake-env';

/**
 * Boot seluruh graf modul aplikasi.
 *
 * Kesalahan penyuntikan dependensi tidak terlihat oleh kompilator: `tsc` senang
 * saja terhadap provider yang lupa didaftarkan atau modul yang lupa mengekspor
 * sesuatu. Kegagalannya baru muncul ketika Nest membangun container — dan pada
 * saat itu yang mati bukan satu endpoint, melainkan seluruh API.
 * `guards-di.spec.ts` menjaga hal yang sama untuk delapan modul di sekitar guard
 * perusahaan; berkas ini menjaganya untuk semuanya, termasuk modul yang tidak
 * dipakai guard itu.
 *
 * ## Kenapa `compile()` dan bukan `init()`
 *
 * `compile()` membangun container dan menginstansiasi provider, tetapi tidak
 * menjalankan `onModuleInit`. Perbedaannya penting di sini:
 *
 * - `PrismaService.onModuleInit` memanggil `$connect()`.
 * - `PythonWorkerService.onModuleInit` menjalankan proses Python untuk pool
 *   pencocokan wajah dan OCR, masing-masing menahan bobot modelnya sendiri.
 * - `SubmissionsService.onModuleInit` memasang `setInterval` satu jam.
 *
 * Tidak satu pun dari ketiganya diperlukan untuk membuktikan grafnya utuh, dan
 * ketiganya membuat uji ini bergantung pada lingkungan. Jadi container dibangun,
 * lalu ditutup.
 *
 * Pasangan berkas ini adalah `app.module.production.spec.ts`, yang membangun graf
 * yang sama dengan `NODE_ENV=production` untuk memastikan `SeedModule` justru
 * TIDAK terdaftar di sana.
 */
describe('AppModule', () => {
  beforeAll(() => {
    terapkanFakeEnv();
  });

  it('membangun seluruh graf dependensinya', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Diperiksa secara khusus karena `SeedModule` baru saja bisa dimuat Jest:
    // `@faker-js/faker` v10 murni ESM, dan selama impornya berada di puncak
    // `seed.service.ts` berkas ini pun tidak akan bisa dijalankan. Impornya
    // sekarang dinamis di dalam `seed()`. Bila seseorang memindahkannya kembali
    // ke puncak berkas, uji ini gagal memuat — dan itulah gunanya.
    //
    // `SeedModule` sendiri hanya terdaftar di luar produksi — lihat
    // `seedModuleEnabled` di `common/dev-flags.ts`. Saklar itu dibaca saat
    // `app.module` diimpor, dan yang membuatnya ikut di sini adalah
    // `NODE_ENV=test` yang sudah dipasang Jest sendiri.
    expect(moduleRef.get(SeedService)).toBeInstanceOf(SeedService);

    await moduleRef.close();
  }, 60000);
});
