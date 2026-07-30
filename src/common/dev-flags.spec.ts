import { seedModuleEnabled, subscriptionLimitsEnforced } from './dev-flags';

describe('dev-flags', () => {
  const semula = { ...process.env };

  afterEach(() => {
    process.env = { ...semula };
  });

  describe('subscriptionLimitsEnforced', () => {
    it('mati kecuali disetel eksplisit', () => {
      delete process.env.ENFORCE_SUBSCRIPTION_LIMITS;
      expect(subscriptionLimitsEnforced()).toBe(false);

      process.env.ENFORCE_SUBSCRIPTION_LIMITS = 'true';
      expect(subscriptionLimitsEnforced()).toBe(true);
    });
  });

  // Saklar ini menentukan apakah `POST /api/v1/seed` — endpoint tanpa guard yang
  // menjalankan `TRUNCATE TABLE "users" CASCADE` — ikut terdaftar. Pengaruh
  // nyatanya terhadap graf modul diuji `app.module.production.spec.ts`; di sini
  // yang dijaga adalah keputusannya sendiri.
  describe('seedModuleEnabled', () => {
    it('menyala di luar produksi', () => {
      delete process.env.ENABLE_SEED_ENDPOINT;

      process.env.NODE_ENV = 'development';
      expect(seedModuleEnabled()).toBe(true);

      process.env.NODE_ENV = 'test';
      expect(seedModuleEnabled()).toBe(true);
    });

    it('mati di produksi', () => {
      delete process.env.ENABLE_SEED_ENDPOINT;
      process.env.NODE_ENV = 'production';

      expect(seedModuleEnabled()).toBe(false);
    });

    // Pintu darurat yang dijanjikan docstring-nya: mesin produksi yang memang
    // perlu menyegarkan data demo bisa menyalakannya lewat satu variabel
    // environment, tanpa menyentuh kode.
    it('bisa dinyalakan kembali di produksi lewat ENABLE_SEED_ENDPOINT', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_SEED_ENDPOINT = 'true';

      expect(seedModuleEnabled()).toBe(true);
    });

    it('hanya menerima nilai "true", bukan sembarang isi', () => {
      process.env.NODE_ENV = 'production';

      for (const nilai of ['1', 'yes', 'TRUE', '']) {
        process.env.ENABLE_SEED_ENDPOINT = nilai;
        expect(seedModuleEnabled()).toBe(false);
      }
    });
  });
});
