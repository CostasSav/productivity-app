# Run on Windows: powershell -File client/scripts/generate-pwa-icons.ps1
# Reproduces public/icons/workspace.svg using the existing teal lightning mark.
Add-Type -AssemblyName System.Drawing
$iconRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public'))
[IO.Directory]::CreateDirectory((Join-Path $iconRoot 'icons')) | Out-Null
$outputs = @{
  'apple-touch-icon.png' = 180
  'icons/pwa-192.png' = 192
  'icons/pwa-512.png' = 512
  'icons/pwa-maskable-512.png' = 512
}
foreach ($entry in $outputs.GetEnumerator()) {
  $size = $entry.Value
  $bitmap = [Drawing.Bitmap]::new($size, $size)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#0d9488'))
  $graphics.ScaleTransform($size / 512.0, $size / 512.0)
  $points = [Drawing.PointF[]]@(
    [Drawing.PointF]::new(272,224), [Drawing.PointF]::new(272,112),
    [Drawing.PointF]::new(128,288), [Drawing.PointF]::new(240,288),
    [Drawing.PointF]::new(240,400), [Drawing.PointF]::new(384,224)
  )
  $pen = [Drawing.Pen]::new([Drawing.Color]::White, 32)
  $pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawPolygon($pen, $points)
  $bitmap.Save((Join-Path $iconRoot $entry.Key), [Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
