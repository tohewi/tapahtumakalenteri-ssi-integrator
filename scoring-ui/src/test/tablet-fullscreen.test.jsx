import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TabletHeaderAndStats } from '../components/TabletScoringPanels'
import { requestTabletFullscreen, exitTabletFullscreen } from '../lib/fullscreen'
import t from '../i18n'

function mockFullscreen() {
  const request = vi.fn().mockResolvedValue(undefined)
  const exit = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(document.documentElement, 'requestFullscreen', 'get').mockReturnValue(request)
  vi.spyOn(document, 'exitFullscreen', 'get').mockReturnValue(exit)
  return { request, exit }
}

function renderHeader() {
  return render(<TabletHeaderAndStats match={{ name: 'Pika' }} squad={{ name: 'Squad 1' }} />)
}

const originals = ['fullscreenElement', 'fullscreenEnabled', 'exitFullscreen'].map(key => [key, Object.getOwnPropertyDescriptor(document, key)])
const originalRequest = Object.getOwnPropertyDescriptor(document.documentElement, 'requestFullscreen')

function setup() {
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, get: () => undefined })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, get: () => undefined })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null })
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true })
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(document, key, descriptor)
    else delete document[key]
  }
  if (originalRequest) Object.defineProperty(document.documentElement, 'requestFullscreen', originalRequest)
  else delete document.documentElement.requestFullscreen
})

describe('tablet fullscreen', () => {
  it('requests document fullscreen immediately with hidden navigation', async () => {
    setup()
    const { request } = mockFullscreen()
    const result = requestTabletFullscreen()
    expect(request).toHaveBeenCalledWith({ navigationUI: 'hide' })
    expect(await result).toBe(true)
  })

  it('does not request fullscreen when already fullscreen or disabled', async () => {
    setup()
    const { request } = mockFullscreen()
    vi.spyOn(document, 'fullscreenElement', 'get').mockReturnValue(document.documentElement)
    expect(await requestTabletFullscreen()).toBe(true)
    expect(request).not.toHaveBeenCalled()
    vi.spyOn(document, 'fullscreenElement', 'get').mockReturnValue(null)
    vi.spyOn(document, 'fullscreenEnabled', 'get').mockReturnValue(false)
    expect(await requestTabletFullscreen()).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('safely handles unavailable APIs and rejected requests', async () => {
    setup()
    expect(await requestTabletFullscreen()).toBe(false)
    expect(await exitTabletFullscreen()).toBe(false)
    const { request, exit } = mockFullscreen()
    request.mockRejectedValue(new Error('Denied'))
    expect(await requestTabletFullscreen()).toBe(false)
    vi.spyOn(document, 'fullscreenElement', 'get').mockReturnValue(document.documentElement)
    exit.mockRejectedValue(new Error('Denied'))
    expect(await exitTabletFullscreen()).toBe(false)
  })

  it('offers one-tap recovery and follows browser exits without forcing reentry', async () => {
    setup()
    const { request, exit } = mockFullscreen()
    renderHeader()
    expect(request).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t.enterFullscreen }))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    act(() => {
      vi.spyOn(document, 'fullscreenElement', 'get').mockReturnValue(document.documentElement)
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(screen.getByRole('button', { name: t.exitFullscreen })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: t.exitFullscreen }))
    await waitFor(() => expect(exit).toHaveBeenCalledTimes(1))
    act(() => {
      vi.spyOn(document, 'fullscreenElement', 'get').mockReturnValue(null)
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(screen.getByRole('button', { name: t.enterFullscreen })).toHaveAttribute('aria-pressed', 'false')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('hides the control when fullscreen is unsupported', () => {
    setup()
    renderHeader()
    expect(screen.queryByRole('button', { name: t.enterFullscreen })).not.toBeInTheDocument()
  })

  it('announces request rejection without breaking the header', async () => {
    setup()
    const { request } = mockFullscreen()
    request.mockRejectedValue(new Error('Denied'))
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: t.enterFullscreen }))
    expect(await screen.findByText(t.fullscreenFailed)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.enterFullscreen })).toBeEnabled()
  })
})
