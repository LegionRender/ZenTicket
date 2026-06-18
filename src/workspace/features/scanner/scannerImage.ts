/**
 * Compresses an image client-side before uploading or saving to Firestore.
 * This keeps the Base64 image payload well under the Firestore document limit
 * while retaining sharp readability for OCR.
 */
export function compressImage(
  file: File,
  maxDimension = 1200,
  quality = 0.75
): Promise<{ base64Str: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("El archivo seleccionado no es una imagen valida."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Error al leer el archivo de imagen."));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error("La imagen esta danada o no se pudo cargar."));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo iniciar el decodificador de imagenes."));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        resolve({
          base64Str: canvas.toDataURL("image/jpeg", quality),
          mimeType: "image/jpeg"
        });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
