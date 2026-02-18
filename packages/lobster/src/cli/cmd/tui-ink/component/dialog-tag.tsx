/** @jsxImportSource react */
import React, { useState, useCallback, useRef } from "react"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"

interface DialogTagProps {
  onSelect: (filePath: string) => void
}

export function DialogTag(props: DialogTagProps) {
  const { sync } = useSDK()
  const dialog = useDialog()
  const [options, setOptions] = useState<DialogSelectOption<string>[]>([])
  const filterVersion = useRef(0)

  const handleFilter = useCallback(
    async (query: string) => {
      const version = ++filterVersion.current
      if (!query) { setOptions([]); return }
      const result = await sync.client.find.files({ query }).catch(() => null)
      if (version !== filterVersion.current) return
      if (!result?.data) return
      const files = (result.data as any as string[]).slice(0, 20)
      setOptions(files.map((f) => ({ title: f, value: f })))
    },
    [sync],
  )

  return (
    <DialogSelect
      title="Find File"
      placeholder="Search files..."
      options={options}
      skipFilter
      onFilter={handleFilter}
      onSelect={(opt) => {
        props.onSelect(opt.value)
        dialog.clear()
      }}
    />
  )
}
