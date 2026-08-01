# Stop hook: typecheck setiap repo yang punya perubahan TypeScript belum ter-commit.
# Exit 2 = blokir penyelesaian dan kirim error balik ke Claude.
# Hasil terakhir di-cache di .claude/.verify-state.json supaya giliran berikutnya
# tidak menjalankan tsc lagi kalau tidak ada file yang berubah.
#
# Berkasnya tinggal di repo backend meskipun memeriksa backend dan frontend
# sekaligus. Sebelumnya ia ada di `D:\Tolongin\.claude\hooks\`, direktori induk
# yang bukan repo — artinya satu-satunya gerbang mutu proyek ini tidak
# terversi sama sekali dan hilang bila mesinnya diganti. `backend/.claude/`
# bukan pilihan: seluruh direktori itu ada di .gitignore.
#
# Didaftarkan di `D:\Tolongin\.claude\settings.json` sebagai hook `Stop`.

$ErrorActionPreference = 'Continue'

# Hindari loop: kalau hook ini yang memicu Claude lanjut bekerja, jangan jalan lagi.
try {
    $stdin = [Console]::In.ReadToEnd()
    if ($stdin) {
        $payload = $stdin | ConvertFrom-Json
        if ($payload.stop_hook_active) { exit 0 }
    }
} catch { }

# Diturunkan dari letak skrip (backend\scripts\), bukan ditulis tetap, supaya
# klon di jalur lain tetap bekerja.
$root      = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$stateFile = Join-Path $root '.claude\.verify-state.json'

$repos = @(
    @{ Name = 'backend';  Match = '\.ts$';       TscArgs = @('--noEmit', '-p', 'tsconfig.json') },
    @{ Name = 'frontend'; Match = '\.(ts|tsx)$'; TscArgs = @('--noEmit') }
)

function Get-ChangedTs($repoPath, $matchPattern) {
    $lines = & git -C $repoPath status --porcelain --untracked-files=all 2>$null
    if (-not $lines) { return @() }
    $files = @()
    foreach ($l in $lines) {
        if ($l.Length -lt 4) { continue }
        $p = $l.Substring(3).Trim()
        if ($p -match ' -> ') { $p = ($p -split ' -> ')[-1] }   # rename
        $p = $p.Trim('"')
        if ($p -match $matchPattern) { $files += $p }
    }
    return $files
}

function Get-Fingerprint($repoPath, $files) {
    $parts = foreach ($f in ($files | Sort-Object)) {
        $full = Join-Path $repoPath $f
        # -LiteralPath wajib: rute dinamis Next.js mengandung kurung siku, dan
        # tanpa ini PowerShell membacanya sebagai kelas karakter wildcard.
        # `app\(dashboard)\support\[id]\page.tsx` karena itu selalu dinilai
        # "deleted" — string tetap yang tidak pernah berubah walau isinya
        # berubah, sehingga cache tidak pernah batal dan tsc dilewati diam-diam
        # untuk setiap suntingan di berkas rute dinamis.
        if (Test-Path -LiteralPath $full) {
            "$f|" + (Get-Item -LiteralPath $full).LastWriteTimeUtc.Ticks
        } else {
            "$f|deleted"
        }
    }
    return ($parts -join ';')
}

# Muat cache
$state = @{}
if (Test-Path $stateFile) {
    try {
        $loaded = Get-Content $stateFile -Raw | ConvertFrom-Json
        foreach ($p in $loaded.PSObject.Properties) { $state[$p.Name] = $p.Value }
    } catch { $state = @{} }
}

$failures = @()
$dirty    = $false

foreach ($r in $repos) {
    $path = Join-Path $root $r.Name
    if (-not (Test-Path (Join-Path $path '.git'))) { continue }

    $files = Get-ChangedTs $path $r.Match
    if ($files.Count -eq 0) { continue }

    $fp = Get-Fingerprint $path $files
    if ($state[$r.Name] -eq $fp) { continue }   # sudah lolos untuk isi yang sama

    # Pakai tsc lokal kalau ada (jauh lebih cepat daripada resolusi npx).
    #
    # Dua jalur, karena pnpm tidak membuat `node_modules\.bin` di repo ini.
    # Tanpa jalur kedua hook jatuh ke `npx tsc`, dan itu bukan sekadar lambat:
    # `tsc` di registry npm adalah paket lain yang sudah tidak dipelihara, jadi
    # npx mengunduhnya lalu keluar dengan kode 1 dan pesan "This is not the tsc
    # command you are looking for". Hasilnya hook memblokir penyelesaian dengan
    # kegagalan yang tidak ada hubungannya dengan kode.
    $binShim = Join-Path $path 'node_modules\.bin\tsc.cmd'
    $tscJs   = Join-Path $path 'node_modules\typescript\bin\tsc'

    if (Test-Path $binShim) {
        $exe = $binShim; $argList = $r.TscArgs
    } elseif (Test-Path $tscJs) {
        $exe = 'node.exe'; $argList = @($tscJs) + $r.TscArgs
    } else {
        # `--package=typescript` supaya npx mengambil kompiler yang benar, bukan
        # paket bernama `tsc`. `--no-install` membuat hook gagal cepat dan jelas
        # kalau dependensinya memang belum terpasang.
        $exe = 'npx.cmd'; $argList = @('--no-install', '--package=typescript', 'tsc') + $r.TscArgs
    }

    $outFile = [System.IO.Path]::GetTempFileName()
    $errFile = "$outFile.err"
    $proc = Start-Process -FilePath $exe -ArgumentList $argList -WorkingDirectory $path `
                          -NoNewWindow -Wait -PassThru `
                          -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $code = $proc.ExitCode
    $out  = @()
    foreach ($f in @($outFile, $errFile)) {
        if (Test-Path $f) { $out += (Get-Content $f -ErrorAction SilentlyContinue); Remove-Item $f -Force -ErrorAction SilentlyContinue }
    }

    if ($code -eq 0) {
        $state[$r.Name] = $fp
        $dirty = $true
    } else {
        $errs = @($out | Select-String -Pattern 'error TS' | ForEach-Object { $_.Line } | Select-Object -First 15)
        if ($errs.Count -eq 0) { $errs = @($out | Select-Object -Last 15) }
        $failures += ("[{0}] tsc keluar dengan kode {1}:`n{2}" -f $r.Name, $code, ($errs -join "`n"))
        if ($state.ContainsKey($r.Name)) { $state.Remove($r.Name); $dirty = $true }
    }
}

if ($dirty) {
    try { ($state | ConvertTo-Json -Compress) | Set-Content -Path $stateFile -Encoding UTF8 } catch { }
}

if ($failures.Count -gt 0) {
    [Console]::Error.WriteLine("Typecheck GAGAL - perbaiki sebelum menyatakan pekerjaan selesai.`n`n" + ($failures -join "`n`n"))
    exit 2
}

exit 0
