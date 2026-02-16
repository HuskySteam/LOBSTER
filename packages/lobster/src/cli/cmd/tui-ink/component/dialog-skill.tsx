/** @jsxImportSource react */
import React, { useState, useEffect, useMemo } from "react"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"

interface DialogSkillProps {
  onSelect: (skillName: string) => void
}

export function DialogSkill(props: DialogSkillProps) {
  const { sync } = useSDK()
  const dialog = useDialog()
  const [skills, setSkills] = useState<{ name: string; description?: string }[]>([])

  useEffect(() => {
    sync.client.app.skills()
      .then((res) => {
        if (res.data) setSkills(res.data as any)
      })
      .catch(() => {})
  }, [sync])

  const options = useMemo<DialogSelectOption<string>[]>(
    () => skills.map((s) => ({
      title: s.name,
      value: s.name,
      description: s.description,
      category: "Skills",
    })),
    [skills],
  )

  return (
    <DialogSelect
      title="Skills"
      placeholder="Search skills..."
      options={options}
      onSelect={(opt) => {
        props.onSelect(opt.value)
        dialog.clear()
      }}
    />
  )
}
