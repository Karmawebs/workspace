export type Attachment = { mime_type: string; size: number };
export function formatError(
  format: string,
  files: Attachment[],
  caption: string,
) {
  if (!["post", "carousel", "reel", "story"].includes(format))
    return "Formato de publicación desconocido.";
  if (
    format === "carousel"
      ? files.length < 2 || files.length > 10
      : files.length !== 1
  )
    return format === "carousel"
      ? "El carrusel requiere de 2 a 10 archivos."
      : "Selecciona un solo archivo.";
  if (format !== "story" && Array.from(caption).length > 2200)
    return "El copy supera los 2200 caracteres.";
  for (const file of files) {
    const video = ["video/mp4", "video/quicktime"].includes(file.mime_type);
    if (!video && file.mime_type !== "image/jpeg")
      return "Instagram requiere imágenes JPEG o vídeos MP4/MOV.";
    if ((format === "post" && video) || (format === "reel" && !video))
      return "El archivo no corresponde al formato seleccionado.";
    const max = video
      ? format === "story"
        ? 100
        : format === "carousel"
          ? 100
          : 1000
      : 8;
    if (file.size <= 0 || file.size > max * 1024 ** 2)
      return "El archivo supera el tamaño admitido o está vacío.";
  }
  return "";
}
export function geometryError(
  format: string,
  video: boolean,
  w: number,
  h: number,
  seconds: number,
) {
  if (!(w > 0 && h > 0)) return "No se pudieron comprobar las dimensiones.";
  const ratio = w / h;
  if (!video && format !== "story" && (ratio < 0.8 || ratio > 1.91))
    return "La imagen del feed debe tener una proporción entre 4:5 y 1,91:1.";
  if (
    video &&
    (w > 1920 ||
      !Number.isFinite(seconds) ||
      seconds < 3 ||
      seconds > (format === "story" ? 60 : format === "carousel" ? 60 : 900))
  )
    return "Comprueba el ancho y la duración del vídeo.";
  return "";
}
export function containerParams(
  format: string,
  mime: string,
  url: string,
  caption: string,
) {
  const video = mime.startsWith("video/");
  const params = new URLSearchParams({
    [video ? "video_url" : "image_url"]: url,
  });
  if (format === "carousel") params.set("is_carousel_item", "true");
  if (format === "story") params.set("media_type", "STORIES");
  else if (video)
    params.set("media_type", format === "carousel" ? "VIDEO" : "REELS");
  if (format === "post" || format === "reel") params.set("caption", caption);
  return params;
}
