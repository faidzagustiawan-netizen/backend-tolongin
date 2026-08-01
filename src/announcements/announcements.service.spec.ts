import { AnnouncementsService } from './announcements.service';

describe('AnnouncementsService', () => {
  let prisma: any;
  let service: AnnouncementsService;

  beforeEach(() => {
    prisma = { announcement: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new AnnouncementsService(prisma);
  });

  it('hanya mengembalikan pengumuman aktif yang belum kedaluwarsa', async () => {
    await service.listActive();

    const where = prisma.announcement.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    // `isActive` dan `expiresAt` sudah lama ada di skema tanpa pernah dipakai
    // menyaring apa pun, karena tidak ada satu pun pembaca pengumuman.
    expect(where.OR).toEqual([
      { expiresAt: null },
      { expiresAt: { gt: expect.any(Date) } },
    ]);
  });

  it('membatasi jumlah spanduk yang tampil sekaligus', async () => {
    await service.listActive();

    expect(prisma.announcement.findMany.mock.calls[0][0].take).toBe(5);
  });
});
