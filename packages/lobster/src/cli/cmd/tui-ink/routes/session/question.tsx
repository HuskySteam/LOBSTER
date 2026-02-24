/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useState, useCallback, useEffect } from "react"
import { useSDK } from "../../context/sdk"
import { useKeybind } from "../../context/keybind"
import type { QuestionRequest } from "@lobster-ai/sdk/v2"
import { KeyHints, PanelHeader, StatusBadge } from "../../ui/chrome"
import { useDesignTokens } from "../../ui/design"

export function QuestionPrompt(props: { request: QuestionRequest }) {
  const { sync } = useSDK()
  const tokens = useDesignTokens()
  const { setBlocker } = useKeybind()
  const [tabIndex, setTabIndex] = useState(0)
  const [selected, setSelected] = useState(0)
  const [answers, setAnswers] = useState<string[][]>([])

  const questions = props.request.questions
  const single = questions.length === 1 && questions[0]?.multiple !== true
  const question = questions[tabIndex]
  const options = question?.options ?? []
  const isMulti = question?.multiple === true

  const blockerID = `question-${props.request.id}`
  useEffect(() => {
    setBlocker(blockerID, true)
    return () => setBlocker(blockerID, false)
  }, [setBlocker, blockerID])

  const reject = useCallback(() => {
    sync.client.question.reject({ requestID: props.request.id })
  }, [sync, props.request.id])

  const submit = useCallback(() => {
    const result = questions.map((_, i) => answers[i] ?? [])
    sync.client.question.reply({
      requestID: props.request.id,
      answers: result,
    })
  }, [sync, props.request.id, answers, questions])

  const pick = useCallback(
    (label: string) => {
      const next = [...answers]
      if (isMulti) {
        const current = next[tabIndex] ?? []
        const idx = current.indexOf(label)
        if (idx >= 0) {
          next[tabIndex] = current.filter((x) => x !== label)
        } else {
          next[tabIndex] = [...current, label]
        }
        setAnswers(next)
      } else {
        next[tabIndex] = [label]
        setAnswers(next)
        if (single) {
          sync.client.question.reply({
            requestID: props.request.id,
            answers: [[label]],
          })
        } else {
          setTabIndex((i) => Math.min(i + 1, questions.length))
          setSelected(0)
        }
      }
    },
    [answers, tabIndex, single, isMulti, sync, props.request.id, questions.length],
  )

  const isConfirmTab = !single && tabIndex === questions.length

  useInput((ch, key) => {
    if (key.escape) {
      reject()
      return
    }

    if (isConfirmTab) {
      if (key.return) submit()
      if (key.leftArrow) setTabIndex((i) => Math.max(0, i - 1))
      return
    }

    if (key.upArrow || ch === "k") {
      if (options.length === 0) return
      setSelected((s) => (s - 1 + options.length) % options.length)
    }
    if (key.downArrow || ch === "j") {
      if (options.length === 0) return
      setSelected((s) => (s + 1) % options.length)
    }
    if (key.return) {
      const opt = options[selected]
      if (opt) pick(opt.label)
    }
    if (key.tab) {
      const total = single ? 1 : questions.length + 1
      setTabIndex((i) => (i + 1) % total)
      setSelected(0)
    }
    const digit = Number(ch)
    if (!Number.isNaN(digit) && digit >= 1 && digit <= options.length) {
      const opt = options[digit - 1]
      if (opt) pick(opt.label)
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={tokens.panel.borderActive}
      paddingLeft={1}
      paddingRight={1}
      marginTop={1}
    >
      <PanelHeader title="Question" right="esc dismiss" />

      {!single ? (
        <Box gap={1} marginBottom={1}>
          {questions.map((q, index) => (
            <Text
              key={q.header}
              color={index === tabIndex ? tokens.text.primary : tokens.text.muted}
              bold={index === tabIndex}
              inverse={index === tabIndex}
            >
              {` ${q.header} `}
            </Text>
          ))}
          <Text
            color={isConfirmTab ? tokens.text.primary : tokens.text.muted}
            bold={isConfirmTab}
            inverse={isConfirmTab}
          >
            {" Confirm "}
          </Text>
        </Box>
      ) : null}

      {!isConfirmTab && question ? (
        <Box flexDirection="column">
          <Box gap={1}>
            <StatusBadge tone="accent" label={question.header} />
            {isMulti ? <StatusBadge tone="muted" label="multi-select" /> : null}
          </Box>
          <Text color={tokens.text.primary} bold>
            {question.question}
          </Text>

          <Box flexDirection="column" marginTop={1}>
            {options.map((opt, index) => {
              const isSelected = index === selected
              const isPicked = (answers[tabIndex] ?? []).includes(opt.label)
              return (
                <Box key={opt.label} flexDirection="column">
                  <Box>
                    <Text color={isSelected ? tokens.list.marker : tokens.text.muted}>{`${index + 1}. `}</Text>
                    <Text
                      color={isSelected ? tokens.text.accent : isPicked ? tokens.status.success : tokens.text.primary}
                      bold={isSelected}
                    >
                      {isMulti ? `[${isPicked ? "x" : " "}] ` : ""}
                      {opt.label}
                    </Text>
                  </Box>
                  {opt.description ? (
                    <Box paddingLeft={3}>
                      <Text color={tokens.text.muted}>{opt.description}</Text>
                    </Box>
                  ) : null}
                </Box>
              )
            })}
          </Box>
        </Box>
      ) : null}

      {isConfirmTab ? (
        <Box flexDirection="column">
          <Text color={tokens.text.primary} bold>
            Review your answers:
          </Text>
          {questions.map((q, index) => (
            <Box key={q.header} paddingLeft={1}>
              <Text color={tokens.text.muted}>{q.header}: </Text>
              <Text color={(answers[index] ?? []).length > 0 ? tokens.text.primary : tokens.status.error}>
                {(answers[index] ?? []).join(", ") || "(not answered)"}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}

      <KeyHints
        items={
          !single
            ? ["tab switch", "up/down select", "enter confirm", "esc dismiss"]
            : ["up/down select", "enter submit", "esc dismiss"]
        }
      />
    </Box>
  )
}
