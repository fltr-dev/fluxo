"use client"

import { useState } from "react"
import { ColorPicker } from "@/components/color-picker"
import { IconPicker, loadIcons, type IconMap } from "@/components/icon-picker"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"

type Props = {
  defaultName?: string
  defaultColor: string
  /** Ícone salvo (null = padrão) */
  defaultIcon: string | null
  /** O ícone atual e o ícone padrão da categoria, já desenhados pelo servidor (a lista completa só carrega ao abrir o seletor) */
  currentIcon: React.ReactNode
  fallbackIcon: React.ReactNode
  placeholder?: string
}

/** Nome, cor e ícone da categoria com pré-visualização do conjunto (mesmos visuais das listas e da dashboard). */
export function CategoryFields({ defaultName = "", defaultColor, defaultIcon, currentIcon, fallbackIcon, placeholder }: Props) {
  const [name, setName] = useState(defaultName)
  const [color, setColor] = useState<string | null>(defaultColor)
  const [icon, setIcon] = useState<string | null>(defaultIcon)
  const [icons, setIcons] = useState<IconMap | null>(null)

  const c = color ?? defaultColor
  const Chosen = icon && icons?.[icon]
  const node = icon === defaultIcon ? currentIcon : Chosen ? <Chosen /> : icon === null ? fallbackIcon : currentIcon

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-4 rounded-xl border bg-muted/40 p-3" aria-label="Pré-visualização">
        <span className="grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-[18px]" style={{ background: `${c}1f`, color: c }}>
          {node}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-medium">{name.trim() || "Nome da categoria"}</span>
          <span className="text-xs text-muted-foreground">Como aparece nas listas</span>
        </span>
        <span className="grid size-10 shrink-0 place-items-center rounded-full text-white [&_svg]:size-[18px]" style={{ background: c }} title="Como aparece na dashboard">
          {node}
        </span>
      </div>

      <label className="grid gap-1.5 text-sm font-medium">
        Nome
        <input name="name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className={fieldClass} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid content-start gap-1.5 text-sm font-medium">
          Cor
          <ColorPicker name="color" value={c} onChange={setColor} className={cn("w-full")} />
        </div>
        <div className="grid content-start gap-1.5 text-sm font-medium">
          Ícone
          <input type="hidden" name="icon" value={icon ?? ""} />
          <IconPicker value={icon} onChange={setIcon} current={node} icons={icons} onOpen={() => loadIcons().then(setIcons)} color={c} />
        </div>
      </div>
    </div>
  )
}
