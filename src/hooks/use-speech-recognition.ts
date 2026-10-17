"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

interface Options {
  lang: string
  onFinal: (text: string) => void
}

const noopSubscribe = () => () => {}
const isSupported = () => Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition)

/** Dictado con Web Speech API (Chrome/Edge/Safari). */
export function useSpeechRecognition({ lang, onFinal }: Options) {
  const supported = useSyncExternalStore(noopSubscribe, isSupported, () => false)
  const [interim, setInterim] = useState("")
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalRef = useRef("")
  const onFinalRef = useRef(onFinal)

  useEffect(() => {
    onFinalRef.current = onFinal
  }, [onFinal])

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Ctor) return false

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    finalRef.current = ""

    recognition.onresult = (event) => {
      let text = ""
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript
      finalRef.current = text
      setInterim(text)
    }
    recognition.onerror = () => {
      finalRef.current = ""
    }
    recognition.onend = () => {
      recognitionRef.current = null
      const text = finalRef.current.trim()
      setInterim("")
      onFinalRef.current(text)
    }

    recognitionRef.current = recognition
    recognition.start()
    return true
  }, [lang])

  const stop = useCallback(() => recognitionRef.current?.stop(), [])
  const abort = useCallback(() => {
    if (!recognitionRef.current) return
    recognitionRef.current.onend = null
    recognitionRef.current.abort()
    recognitionRef.current = null
    setInterim("")
  }, [])

  useEffect(() => abort, [abort])

  return { supported, interim, start, stop, abort }
}
