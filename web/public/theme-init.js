// Applies a stored theme choice before first paint. The page loads this as a
// blocking script in its head, since a module runs after the first paint and
// would show the system theme before flipping.
try {
  const theme = localStorage.getItem('theme')
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme)
  }
} catch {
  // Storage is blocked, so the page follows the system theme.
}
