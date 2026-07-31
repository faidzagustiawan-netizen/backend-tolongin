import { ChallengesService } from './challenges.service';

/**
 * `absorbSelfWrittenQuestions` menulis ke koleksi soal perusahaan tanpa
 * diminta secara eksplisit tiap kali, jadi perilakunya harus pasti: yang
 * diserap hanya soal tulisan sendiri, tidak ada yang digandakan, dan tautan
 * baliknya benar-benar dipasang supaya penerbitan ulang tidak menumpuk.
 *
 * Metodenya hanya menyentuh `tx`, jadi instansinya dibuat dari prototipe —
 * tidak ada dependensi lain yang perlu dipalsukan.
 */
type AbsorbCallable = {
  absorbSelfWrittenQuestions: (
    tx: any,
    challengeId: string,
    companyId: string,
  ) => Promise<number>;
};

// Metodenya privat; menggabungkannya dengan tipe kelas menghasilkan `never`,
// jadi yang dipakai hanya bentuk yang benar-benar dipanggil di berkas ini.
const makeService = () =>
  Object.create(ChallengesService.prototype) as AbsorbCallable;

const makeTx = (
  components: any[],
  existingItems: any[] = [],
  categoryId: string | null = 'cat-frontend',
) => ({
  challenge: {
    findUnique: jest.fn().mockResolvedValue({
      categoryId,
      difficulty: 'INTERMEDIATE',
    }),
  },
  challengeComponent: {
    findMany: jest.fn().mockResolvedValue(components),
    update: jest.fn().mockResolvedValue({}),
  },
  questionBankItem: {
    findMany: jest.fn().mockResolvedValue(existingItems),
    create: jest
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve({ id: `item-for-${data.question}` }),
      ),
  },
});

describe('absorbSelfWrittenQuestions', () => {
  it('menyalin soal tulisan sendiri dan menautkannya balik ke bank', async () => {
    const service = makeService();
    const tx = makeTx([
      {
        id: 'comp-1',
        type: 'MULTIPLE_CHOICE',
        question: 'Ibu kota Jepang?',
        description: null,
        options: [{ text: 'Tokyo', isCorrect: true }],
        metadata: null,
        points: 15,
      },
    ]);

    const created = await service.absorbSelfWrittenQuestions(
      tx,
      'ch-1',
      'co-1',
    );

    expect(created).toBe(1);
    expect(tx.questionBankItem.create).toHaveBeenCalledTimes(1);
    expect(tx.questionBankItem.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'co-1',
      question: 'Ibu kota Jepang?',
      defaultPoints: 15,
      categoryId: 'cat-frontend',
      difficulty: 'INTERMEDIATE',
    });

    // Tanpa tautan balik, penerbitan berikutnya menyalin soal yang sama lagi.
    expect(tx.challengeComponent.update).toHaveBeenCalledWith({
      where: { id: 'comp-1' },
      data: { sourceItemId: 'item-for-Ibu kota Jepang?' },
    });
  });

  it('hanya membaca komponen yang belum bertaut ke bank', async () => {
    const service = makeService();
    const tx = makeTx([]);

    await service.absorbSelfWrittenQuestions(tx, 'ch-1', 'co-1');

    expect(tx.challengeComponent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { section: { challengeId: 'ch-1' }, sourceItemId: null },
      }),
    );
  });

  it('tidak menggandakan soal yang teksnya sudah ada di koleksi', async () => {
    const service = makeService();
    const tx = makeTx(
      [
        {
          id: 'comp-1',
          type: 'ESSAY',
          question: 'Apa itu closure?',
          description: null,
          options: null,
          metadata: null,
          points: 20,
        },
      ],
      [{ id: 'item-lama', question: 'Apa itu closure?' }],
    );

    const created = await service.absorbSelfWrittenQuestions(
      tx,
      'ch-1',
      'co-1',
    );

    expect(created).toBe(0);
    expect(tx.questionBankItem.create).not.toHaveBeenCalled();
    // Tetap ditautkan ke entri yang sudah ada, supaya jumlah pemakaiannya
    // terhitung dan penerbitan ulang tidak memeriksanya lagi.
    expect(tx.challengeComponent.update).toHaveBeenCalledWith({
      where: { id: 'comp-1' },
      data: { sourceItemId: 'item-lama' },
    });
  });

  it('melewati soal yang pertanyaannya masih kosong', async () => {
    const service = makeService();
    const tx = makeTx([
      {
        id: 'comp-kosong',
        type: 'ESSAY',
        question: '   ',
        description: null,
        options: null,
        metadata: null,
        points: 10,
      },
    ]);

    const created = await service.absorbSelfWrittenQuestions(
      tx,
      'ch-1',
      'co-1',
    );

    expect(created).toBe(0);
    expect(tx.questionBankItem.create).not.toHaveBeenCalled();
    expect(tx.challengeComponent.update).not.toHaveBeenCalled();
  });

  it('menyimpan soal dari studi kasus tanpa bidang sebagai lintas bidang', async () => {
    const service = makeService();
    const tx = makeTx(
      [
        {
          id: 'comp-1',
          type: 'ESSAY',
          question: 'Ceritakan proses editing Anda.',
          description: null,
          options: null,
          metadata: null,
          points: 20,
        },
      ],
      [],
      null,
    );

    await service.absorbSelfWrittenQuestions(tx, 'ch-1', 'co-1');

    // Studi kasus tanpa bidang menghasilkan soal lintas bidang; `categoryId:
    // null` itulah artinya, dan soal semacam itu yang paling luas dipakai.
    expect(
      tx.questionBankItem.create.mock.calls[0][0].data.categoryId,
    ).toBeNull();
  });

  it('menyerah dengan tenang bila challenge-nya tidak ada', async () => {
    const service = makeService();
    const tx = makeTx([]);
    tx.challenge.findUnique.mockResolvedValue(null);

    await expect(
      service.absorbSelfWrittenQuestions(tx, 'hilang', 'co-1'),
    ).resolves.toBe(0);
    expect(tx.challengeComponent.findMany).not.toHaveBeenCalled();
  });
});
