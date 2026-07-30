import { Test } from '@nestjs/testing';
import { terapkanFakeEnv } from './common/testing/fake-env';

/**
 * `SeedModule` tidak boleh terdaftar di produksi.
 *
 * `POST /api/v1/seed` tidak memasang satu pun guard, dan hal pertama yang
 * dikerjakan penanganannya adalah `TRUNCATE TABLE "users" CASCADE` beserta
 * `"badges"` dan `"challenges"`. Tidak ada guard global yang menutupinya:
 * satu-satunya `APP_GUARD` di `app.module.ts` adalah pembatas laju. Selama
 * controllernya belum berguard admin, tidak terdaftarnya modul itu adalah
 * satu-satunya yang memisahkan basis data produksi dari siapa pun yang bisa
 * menjangkau API — jadi hal itu layak diuji, bukan sekadar dibaca dari satu
 * baris di `app.module.ts`.
 *
 * ## Kenapa berkas terpisah, dan kenapa `require`
 *
 * `seedModuleEnabled` dibaca saat modul dimuat, karena daftar `imports` sebuah
 * dekorator `@Module` dievaluasi sekali pada waktu boot. `NODE_ENV` karena itu
 * harus sudah berubah SEBELUM `app.module` diimpor — dan pernyataan `import`
 * dihoisting ke atas segalanya, sehingga penetapan `process.env` biasa selalu
 * kalah cepat. `require` di badan berkas berjalan setelahnya.
 *
 * `jest.isolateModules` sempat dicoba supaya keduanya bisa satu berkas dengan
 * `app.module.spec.ts`, dan itu tidak bisa dipakai: registry bersihnya memuat
 * ulang `@nestjs/schedule` tanpa memuat ulang `@nestjs/core` milik
 * `@nestjs/testing`, sehingga identitas `Reflector` pecah dan `ScheduleModule`
 * gagal diresolusi. Satu berkas uji per registry adalah cara yang bekerja.
 */
terapkanFakeEnv();
process.env.NODE_ENV = 'production';
delete process.env.ENABLE_SEED_ENDPOINT;

const { AppModule } = require('./app.module') as typeof import('./app.module');
const { SeedService } =
  require('./seed/seed.service') as typeof import('./seed/seed.service');

describe('AppModule di produksi', () => {
  it('tidak mendaftarkan SeedModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Kelas `SeedService` di atas berasal dari registry berkas ini juga, jadi
    // kegagalan resolusinya memang karena providernya tidak terdaftar — bukan
    // karena identitas kelas dari registry lain.
    expect(() => moduleRef.get(SeedService)).toThrow(/SeedService/);

    await moduleRef.close();
  }, 60000);
});
