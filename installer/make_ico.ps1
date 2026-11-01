Add-Type -AssemblyName System.Drawing

function Convert-PngToIco {
    param(
        [string]$PngPath,
        [string]$IcoPath
    )

    $srcBmp = [System.Drawing.Bitmap]::FromFile($PngPath)
    $sizes = @(16, 32, 48, 64, 128, 256)
    
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    # ICONDIR
    $bw.Write([uint16]0) # Reserved
    $bw.Write([uint16]1) # Type (1 = ICO)
    $bw.Write([uint16]$sizes.Count) # Image count

    $pngStreams = @()
    foreach ($sz in $sizes) {
        $resized = New-Object System.Drawing.Bitmap($sz, $sz)
        $g = [System.Drawing.Graphics]::FromImage($resized)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($srcBmp, 0, 0, $sz, $sz)
        $g.Dispose()

        $pngMs = New-Object System.IO.MemoryStream
        $resized.Save($pngMs, [System.Drawing.Imaging.ImageFormat]::Png)
        $resized.Dispose()
        $pngStreams += $pngMs
    }

    $offset = 6 + (16 * $sizes.Count)

    # ICONDIRENTRY
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $sz = $sizes[$i]
        $w = if ($sz -eq 256) { 0 } else { [byte]$sz }
        $h = if ($sz -eq 256) { 0 } else { [byte]$sz }
        $bw.Write([byte]$w)
        $bw.Write([byte]$h)
        $bw.Write([byte]0) # Color count
        $bw.Write([byte]0) # Reserved
        $bw.Write([uint16]1) # Color planes
        $bw.Write([uint16]32) # Bit count
        $bw.Write([uint32]$pngStreams[$i].Length) # Bytes in resource
        $bw.Write([uint32]$offset) # Image offset
        $offset += $pngStreams[$i].Length
    }

    # Image Data
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $bytes = $pngStreams[$i].ToArray()
        $bw.Write($bytes)
        $pngStreams[$i].Dispose()
    }

    $srcBmp.Dispose()
    $bw.Flush()

    [System.IO.File]::WriteAllBytes($IcoPath, $ms.ToArray())
    $bw.Dispose()
    $ms.Dispose()
    Write-Host "Generated multi-res icon at $IcoPath"
}

Convert-PngToIco -PngPath "C:\Users\user\code\old-thing-search\app-icon.png" -IcoPath "C:\Users\user\code\old-thing-search\app.ico"
Copy-Item "C:\Users\user\code\old-thing-search\app.ico" "C:\Users\user\code\old-thing-search\installer\app.ico" -Force
