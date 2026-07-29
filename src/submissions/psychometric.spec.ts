import { BadRequestException } from '@nestjs/common';
import {
  assertPsychometricMetadata,
  computePsychometricProfile,
  readPsychometricMetadata,
} from './psychometric';

const likert = (dimension: string, reverse = false) => ({
  dimension,
  scaleMin: 1,
  scaleMax: 5,
  reverse,
});

describe('psychometric', () => {
  describe('readPsychometricMetadata', () => {
    it('menolak metadata tanpa nama dimensi', () => {
      const result = readPsychometricMetadata({ scaleMin: 1, scaleMax: 5 });

      expect(result).toEqual({ ok: false, reason: 'nama dimensi belum diisi' });
    });

    it('menolak skala yang terlalu pendek', () => {
      const result = readPsychometricMetadata({
        dimension: 'Ketelitian',
        scaleMin: 1,
        scaleMax: 2,
      });

      expect(result.ok).toBe(false);
    });

    it('menolak skala yang terlalu panjang', () => {
      const result = readPsychometricMetadata({
        dimension: 'Ketelitian',
        scaleMin: 1,
        scaleMax: 12,
      });

      expect(result.ok).toBe(false);
    });

    it('menerima skala Likert 1-5', () => {
      const result = readPsychometricMetadata(likert('Ketelitian'));

      expect(result).toEqual({
        ok: true,
        value: {
          dimension: 'Ketelitian',
          scaleMin: 1,
          scaleMax: 5,
          reverse: false,
        },
      });
    });
  });

  describe('assertPsychometricMetadata', () => {
    it('melempar dengan menyebut soal yang bermasalah', () => {
      expect(() => assertPsychometricMetadata('Saya teliti', {})).toThrow(
        BadRequestException,
      );
      expect(() => assertPsychometricMetadata('Saya teliti', {})).toThrow(
        /Saya teliti/,
      );
    });

    it('meloloskan metadata yang sah', () => {
      expect(() =>
        assertPsychometricMetadata('Saya teliti', likert('Ketelitian')),
      ).not.toThrow();
    });
  });

  describe('computePsychometricProfile', () => {
    it('mengembalikan null bila tidak ada jawaban psikometrik', () => {
      expect(computePsychometricProfile([])).toBeNull();
    });

    it('memetakan ujung skala ke 0 dan 100', () => {
      const profile = computePsychometricProfile([
        { metadata: likert('Ketelitian'), value: '5' },
        { metadata: likert('Kerja Sama'), value: '1' },
      ]);

      expect(profile?.dimensions).toEqual([
        { name: 'Kerja Sama', score: 0, itemCount: 1 },
        { name: 'Ketelitian', score: 100, itemCount: 1 },
      ]);
    });

    it('membalik nilai pada soal terbalik', () => {
      // Setuju pada pernyataan negatif berarti dimensinya rendah, bukan tinggi.
      const profile = computePsychometricProfile([
        { metadata: likert('Ketelitian', true), value: '5' },
      ]);

      expect(profile?.dimensions[0].score).toBe(0);
    });

    it('merata-ratakan beberapa soal dalam satu dimensi', () => {
      const profile = computePsychometricProfile([
        { metadata: likert('Ketelitian'), value: '5' },
        { metadata: likert('Ketelitian'), value: '3' },
      ]);

      expect(profile?.dimensions[0]).toEqual({
        name: 'Ketelitian',
        score: 75,
        itemCount: 2,
      });
    });

    it('menjepit jawaban di luar skala alih-alih membuang pengumpulannya', () => {
      const profile = computePsychometricProfile([
        { metadata: likert('Ketelitian'), value: '99' },
      ]);

      expect(profile?.dimensions[0].score).toBe(100);
    });

    it('melewati soal yang metadatanya rusak tanpa menggagalkan sisanya', () => {
      const profile = computePsychometricProfile([
        { metadata: { dimension: '' }, value: '5' },
        { metadata: likert('Ketelitian'), value: '4' },
      ]);

      expect(profile?.dimensions).toHaveLength(1);
      expect(profile?.dimensions[0].name).toBe('Ketelitian');
    });

    it('melewati jawaban yang bukan angka', () => {
      const profile = computePsychometricProfile([
        { metadata: likert('Ketelitian'), value: 'setuju' },
      ]);

      expect(profile).toBeNull();
    });

    it('tidak pernah menghasilkan skor di luar 0-100', () => {
      const profile = computePsychometricProfile([
        { metadata: likert('A'), value: '-40' },
        { metadata: likert('B'), value: '400' },
      ]);

      for (const dimension of profile?.dimensions ?? []) {
        expect(dimension.score).toBeGreaterThanOrEqual(0);
        expect(dimension.score).toBeLessThanOrEqual(100);
      }
    });
  });
});
