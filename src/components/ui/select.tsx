"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cn } from "cn"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn("scroll-my-1", className)} {...props} />
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" className={cn("flex flex-1 items-center gap-2 truncate text-left data-placeholder:text-muted-foreground", className)} {...props} />
}

function SelectTrigger({ className, size = "default", children, ...props }: SelectPrimitive.Trigger.Props & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm whitespace-nowrap shadow-xs transition-colors outline-none select-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-popup-open:border-ring data-[size=default]:h-9 data-[size=sm]:h-8 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 text-muted-foreground" />} />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({ className, children, sideOffset = 4, align = "start", ...props }: SelectPrimitive.Popup.Props & Pick<SelectPrimitive.Positioner.Props, "sideOffset" | "align">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={sideOffset} align={align} alignItemWithTrigger={false} className="isolate z-[60] outline-none">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative flex max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow className="absolute top-0 z-10 flex h-5 w-full items-center justify-center bg-popover text-muted-foreground">
            <ChevronUpIcon className="size-4" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List className="max-h-(--available-height) overflow-y-auto p-1">{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="absolute bottom-0 z-10 flex h-5 w-full items-center justify-center bg-popover text-muted-foreground">
            <ChevronDownIcon className="size-4" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return <SelectPrimitive.GroupLabel data-slot="select-label" className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator render={<span className="pointer-events-none absolute right-2 grid size-4 place-items-center" />}>
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue }
