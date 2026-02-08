import '@testing-library/jest-dom'

// Set navigator.language to Finnish for tests to ensure consistent i18n behavior
Object.defineProperty(navigator, 'language', {
  value: 'fi-FI',
  writable: false,
  configurable: true,
})
