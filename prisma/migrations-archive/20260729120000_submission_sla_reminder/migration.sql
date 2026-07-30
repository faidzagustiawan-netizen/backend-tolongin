-- SLA tinjauan 7 hari sudah lama dihitung dan ditampilkan di dasbor
-- perusahaan (`nearestSlaDate`), tetapi tidak ada apa pun yang terjadi ketika
-- terlewat: tidak ada pengingat ke perusahaan, tidak ada kabar ke kandidat.
-- Pelamar bisa menunggu tanpa batas tanpa tahu apa-apa.
--
-- Kolom ini menandai bahwa pengingat sudah dikirim, supaya cron harian tidak
-- berubah menjadi notifikasi harian untuk submisi yang sama.

ALTER TABLE "submissions" ADD COLUMN "slaReminderSentAt" TIMESTAMP(3);
