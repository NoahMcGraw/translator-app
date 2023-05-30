import { useState } from 'react'
import RecordRTC from 'recordrtc'
import { Languages } from '../models/Languages.model'
import { Transcription } from '../models/Transcription.model'
import TranscriptionService from '../services/transcriptionService'

const useTranslator = () => {
  const [transcriptions, setTranscription] = useState<Transcription[] | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startRecording = async (languages: Languages[]) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new RecordRTC(stream, {
      type: 'audio',
      mimeType: 'audio/wav',
      recorderType: RecordRTC.StereoAudioRecorder,
      sampleRate: 44100,
      numberOfAudioChannels: 2,
    })

    recorder.startRecording()
    setIsRecording(true)

    setTimeout(() => {
      recorder.stopRecording(async () => {
        setIsRecording(false)
        const blob = recorder.getBlob()
        console.log(blob)

        try {
          const transcriptionService = new TranscriptionService({})
          const res = await transcriptionService.getTranscription({ audio: blob })
          console.log(res)
          // Iterate through the res and create a Transcription object for each
          //TODO: DO THIS
          transcriptions?.push(res)
          setTranscription(transcriptions)
          setError(null)
        } catch (err: any) {
          setError('Transcription error: ' + err.message)
          setTranscription(null)
          console.error(err)
          console.error(err.message)
        }
      })
    }, 5000)
  }

  return { isRecording, transcriptions, startRecording }
}

export default useTranslator
