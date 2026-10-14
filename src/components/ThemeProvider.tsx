import { createContext, useContext, useEffect, useState } from "react"

export type Theme = "dark" | "light" | "system"

export type ThemeProviderState = {
  theme: Theme
  resolvedTheme: "dark" | "light"
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const initialState: ThemeProviderState = {
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => null,
  toggleTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "video-admin-theme",
  ...props
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      if (typeof window === "undefined") return defaultTheme;
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() => {
    try {
      if (typeof window === "undefined") return defaultTheme === "dark" ? "dark" : "light";
      const saved = (localStorage.getItem(storageKey) as Theme) || defaultTheme;
      if (saved === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return saved === "dark" ? "dark" : "light";
    } catch {
      return defaultTheme === "dark" ? "dark" : "light";
    }
  });

  useEffect(() => {
    const root = window.document.documentElement

    const getActiveTheme = (): "dark" | "light" => {
      if (theme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      }
      return theme === "dark" ? "dark" : "light"
    }

    const active = getActiveTheme()
    setResolvedTheme(active)

    root.classList.remove("light", "dark")
    root.classList.add(active)
    root.style.colorScheme = active

    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)")
      const listener = (e: MediaQueryListEvent) => {
        const next = e.matches ? "dark" : "light"
        setResolvedTheme(next)
        root.classList.remove("light", "dark")
        root.classList.add(next)
        root.style.colorScheme = next
      }
      media.addEventListener("change", listener)
      return () => media.removeEventListener("change", listener)
    }
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    try {
      localStorage.setItem(storageKey, newTheme)
    } catch {
      // ignore storage errors
    }
    setThemeState(newTheme)
  }

  const toggleTheme = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark"
    setTheme(next)
  }

  const value: ThemeProviderState = {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
