/**
 * Entrega um arquivo ao usuário: no celular abre a folha de compartilhar (Salvar em Arquivos, enviar por WhatsApp…);
 * onde não existe, baixa. Devolve false se a pessoa fechou a folha sem escolher nada.
 */
export async function shareOrDownload(file: File): Promise<boolean> {
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] })
      return true
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
