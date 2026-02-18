/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useState, useCallback, useEffect } from "react"
import { useTheme } from "../../theme"
import { useSDK } from "../../context/sdk"
import { useKeybind } from "../../context/keybind"
import type { QuestionRequest } from "@lobster-ai/sdk/v2"

export function QuestionPrompt(props: { request: QuestionRequest }) {
  const { sync } = useSDK()
  const { theme } = useTheme()
  const { setBlocker } = useKeybind()
  const [tabIndex, setTabIndex] = useState(0)
  const [selected, setSelected] = useState(0)
  const [answers, setAnswers] = useState<string[][]>([])

  const questions = props.request.questions
  const single = questions.length === 1 && questions[0]?.multiple !== true
  const question = questions[tabIndex]
  const options = question?.options ?? []
  const isMulti = question?.multiple === true

  // Register blocker so global keybinds (Esc, Ctrl+C) don't fire
  // Use request ID to avoid collisions when multiple question prompts are mounted
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
    // Number shortcuts
    const digit = Number(ch)
    if (!Number.isNaN(digit) && digit >= 1 && digit <= options.length) {
      const opt = options[digit - 1]
      if (opt) pick(opt.label)
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.accent}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Tabs for multi-question */}
      {!single && (
        <Box gap={1} marginBottom={1}>
          {questions.map((q, i) => (
            <Text
              key={i}
              color={i === tabIndex ? theme.text : theme.textMuted}
              bold={i === tabIndex}
              inverse={i === tabIndex}
            >
              {` ${q.header} `}
            </Text>
          ))}
          <Text
            color={isConfirmTab ? theme.text : theme.textMuted}
            bold={isConfirmTab}
            inverse={isConfirmTab}
          >
            {" Confirm "}
          </Text>
        </Box>
      )}

      {/* Question content */}
      {!isConfirmTab && question && (
        <Box flexDirection="column">
          <Text color={theme.text} bold>
            {question.question}
            {isMulti ? " (select all that apply)" : ""}
          </Text>

          <Box flexDirection="column" marginTop={1}>
            {options.map((opt, i) => {
              const isSelected = i === selected
              const isPicked = (answers[tabIndex] ?? []).includes(opt.label)
              return (
                <Box key={i} flexDirection="column">
                  <Box>
                    <Text color={isSelected ? theme.secondary : theme.textMuted}>
                      {`${i + 1}. `}
                    </Text>
                    <Text
                      color={isSelected ? theme.secondary : isPicked ? theme.success : theme.text}
                      bold={isSelected}
                    >
                      {isMulti ? `[${isPicked ? "x" : " "}] ` : ""}
                      {opt.label}
                    </Text>
                  </Box>
                  {opt.description && (
                    <Box paddingLeft={3}>
                      <Text color={theme.textMuted}>{opt.description}</Text>
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        </Box>
      )}

      {/* Confirm tab */}
      {isConfirmTab && (
        <Box flexDirection="column">
          <Text color={theme.text} bold>Review your answers:</Text>
          {questions.map((q, i) => (
            <Box key={i} paddingLeft={1}>
              <Text color={theme.textMuted}>{q.header}: </Text>
              <Text color={(answers[i] ?? []).length > 0 ? theme.text : theme.error}>
                {(answers[i] ?? []).join(", ") || "(not answered)"}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Hints */}
      <Box marginTop={1} gap={2}>
        {!single && <Text color={theme.textMuted}>tab switch</Text>}
        {!isConfirmTab && <Text color={theme.textMuted}>{"↑↓ select"}</Text>}
        <Text color={theme.textMuted}>
          enter {isConfirmTab ? "submit" : isMulti ? "toggle" : single ? "submit" : "confirm"}
        </Text>
        <Text color={theme.textMuted}>esc dismiss</Text>
      </Box>
    </Box>
  )
}
