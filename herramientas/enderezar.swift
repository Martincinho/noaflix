// Guarda una foto ya girada en su orientación correcta (sin depender de la etiqueta EXIF).
// Uso: swift herramientas/enderezar.swift entrada.jpg salida.jpg [lado_maximo]
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else { print("uso: enderezar entrada salida [lado]"); exit(1) }
let entrada = URL(fileURLWithPath: args[1]), salida = URL(fileURLWithPath: args[2])
let lado = args.count > 3 ? Int(args[3])! : 4000
guard let src = CGImageSourceCreateWithURL(entrada as CFURL, nil) else { print("no se pudo abrir"); exit(1) }
let opciones: [CFString: Any] = [
  kCGImageSourceCreateThumbnailFromImageAlways: true,
  kCGImageSourceCreateThumbnailWithTransform: true,   // aplica la rotación de la foto
  kCGImageSourceThumbnailMaxPixelSize: lado,
]
guard let img = CGImageSourceCreateThumbnailAtIndex(src, 0, opciones as CFDictionary) else { print("no se pudo girar"); exit(1) }
guard let dest = CGImageDestinationCreateWithURL(salida as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: 0.88] as CFDictionary)
CGImageDestinationFinalize(dest)
print("\(img.width)x\(img.height)")
