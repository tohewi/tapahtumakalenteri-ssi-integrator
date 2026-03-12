// ============================================================
// TenantBrandingTab — Logo upload, preview, remove (MP9)
//
// Accepts drag-drop or click-to-select. Validates file type
// and size client-side before uploading as base64 data URL.
// Logo served via public GET endpoint for CDN-friendly caching.
// ============================================================

import { useState, useRef, useCallback } from 'react'
import { SectionCard, StatusMessage } from './shared.jsx'
import { usePlatformT } from '../../../platform-i18n.jsx'
import { uploadTenantLogo, deleteTenantLogo, getTenantLogoUrl } from '../../../platform-api.js'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB

export function TenantBrandingTab({ tenantId, tenant, onTenantUpdated }) {
  const { t } = usePlatformT()
  const [hasLogo, setHasLogo] = useState(tenant?.hasLogo || false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  // Cache-bust key — changes when logo is uploaded/removed to force re-render
  const [logoVersion, setLogoVersion] = useState(() => Date.now())
  const fileInputRef = useRef(null)

  const handleFile = useCallback(async (file) => {
    if (!file) return

    // Client-side validation
    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus({ type: 'error', message: t('logoInvalidType') })
      return
    }
    if (file.size > MAX_SIZE) {
      setStatus({ type: 'error', message: t('logoTooLarge') })
      return
    }

    // Read as data URL
    setUploading(true)
    setStatus(null)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })

      await uploadTenantLogo(tenantId, dataUrl)
      setHasLogo(true)
      setLogoVersion(Date.now())
      setStatus({ type: 'success', message: t('logoUploaded') })
      if (onTenantUpdated) onTenantUpdated()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setUploading(false)
    }
  }, [tenantId, t, onTenantUpdated])

  const handleRemove = useCallback(async () => {
    if (!confirm(t('removeLogoConfirm'))) return
    setUploading(true)
    setStatus(null)
    try {
      await deleteTenantLogo(tenantId)
      setHasLogo(false)
      setLogoVersion(Date.now())
      setStatus({ type: 'success', message: t('logoRemoved') })
      if (onTenantUpdated) onTenantUpdated()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setUploading(false)
    }
  }, [tenantId, t, onTenantUpdated])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleInputChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [handleFile])

  const logoUrl = `${getTenantLogoUrl(tenantId)}?v=${logoVersion}`

  return (
    <SectionCard title={t('branding')} description={t('brandingDesc')}>
      <StatusMessage {...(status || {})} />

      <div className="space-y-4">
        {/* Logo preview */}
        {hasLogo && (
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 rounded-lg border bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src={logoUrl}
                alt={t('tenantLogo')}
                className="max-w-full max-h-full object-contain"
                onError={() => setHasLogo(false)}
              />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-sm text-sky-600 hover:text-sky-700 font-medium disabled:opacity-50"
              >
                {t('changeLogo')}
              </button>
              <button
                onClick={handleRemove}
                disabled={uploading}
                className="text-sm text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
              >
                {t('removeLogo')}
              </button>
            </div>
          </div>
        )}

        {/* Upload drop zone (shown when no logo, or as alternative) */}
        {!hasLogo && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${dragOver
                ? 'border-sky-400 bg-sky-50'
                : 'border-gray-300 hover:border-sky-300 hover:bg-gray-50'
              }
              ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {uploading ? (
              <div className="text-sm text-gray-500">{t('logoUploading')}</div>
            ) : (
              <>
                <div className="text-3xl mb-2">📷</div>
                <div className="text-sm text-gray-600 font-medium">{t('dragDropLogo')}</div>
                <div className="text-xs text-gray-400 mt-1">{t('logoFormats')}</div>
              </>
            )}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
    </SectionCard>
  )
}
