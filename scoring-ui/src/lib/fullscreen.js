export async function requestTabletFullscreen() {
  if (document.fullscreenElement) return true
  if (!document.documentElement.requestFullscreen || document.fullscreenEnabled === false) return false
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    return true
  } catch {
    return false
  }
}

export async function exitTabletFullscreen() {
  if (!document.fullscreenElement || !document.exitFullscreen) return false
  try {
    await document.exitFullscreen()
    return true
  } catch {
    return false
  }
}
