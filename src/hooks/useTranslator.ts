import { useState } from 'react'
import RecordRTC from 'recordrtc'
import { Languages } from '../models/Languages.model'
import { Translations } from '../models/Translations.model'
import TranslatorService from '../services/translatorService'

const useTranslator = () => {
  const [translationTexts, setTranslationTexts] = useState<Translations | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startRecording = async (languages: Languages[]) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new RecordRTC(stream, {
      type: 'audio',
      mimeType: 'audio/webm;codecs=pcm',
      sampleRate: 16000,
      numberOfAudioChannels: 1,
    })

    recorder.startRecording()
    setIsRecording(true)

    setTimeout(() => {
      recorder.stopRecording(async () => {
        setIsRecording(false)
        const blob = recorder.getBlob()
        console.log(blob)

        try {
          // const translations = await TranslatorService.getTranslation(formData)
          const translations = await TranslatorService.getTranscription({ audio: blob })
          console.log(translations)
          // setTranslationTexts(translations)
          setError(null)
        } catch (err: any) {
          setError('Translation error: ' + err.message)
          setTranslationTexts(null)
          console.error(error)
        }
      })
    }, 5000)
  }

  return { isRecording, translationTexts, startRecording }
}

export default useTranslator
