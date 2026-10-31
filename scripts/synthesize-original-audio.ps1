param([Parameter(Mandatory = $true)][string]$Jobs, [Parameter(Mandatory = $true)][string]$Ffmpeg)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SelectVoice('Microsoft Zira Desktop')
$speaker.Rate = -1
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$queue = Get-Content -LiteralPath $Jobs -Raw -Encoding UTF8 | ConvertFrom-Json
try {
  $completed = 0
  foreach ($job in $queue) {
    $wave = [System.IO.Path]::ChangeExtension($job.destination, '.wav')
    try {
      $speaker.SetOutputToWaveFile($wave, $format)
      # Speaker labels are display text, not part of the spoken conversation.
      $spoken = $job.text -replace '(?m)^[MW]:\s*', ''
      $speaker.Speak($spoken)
      $speaker.SetOutputToNull()
      & $Ffmpeg -hide_banner -loglevel error -y -i $wave -codec:a libmp3lame -b:a 48k -ar 22050 -ac 1 $job.destination
      if ($LASTEXITCODE -ne 0) { throw 'MP3 encoding failed.' }
      $completed++
      if ($completed % 10 -eq 0) { Write-Output "Prepared $completed / $($queue.Count) recordings" }
    } finally {
      if (Test-Path -LiteralPath $wave) { Remove-Item -LiteralPath $wave }
    }
  }
} finally { $speaker.Dispose() }
