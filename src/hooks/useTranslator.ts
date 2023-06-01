import { useRef, useState } from 'react'
import RecordRTC from 'recordrtc'
import { Languages } from '../models/Languages.model'
import { Transcription } from '../models/Transcription.model'
import TranscriptionService from '../services/transcriptionService'

const useTranslator = () => {
  const [transcriptions, setTranscription] = useState<Transcription[] | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<RecordRTC | null>(null)
  const transcriptionRef = useRef<TranscriptionService | null>(null)

  const startRecording = async (languages: Languages[]) => {
    const transcriptionService = new TranscriptionService({})
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new RecordRTC(stream, {
      type: 'audio',
      mimeType: 'audio/wav',
      recorderType: RecordRTC.StereoAudioRecorder,
      sampleRate: 44100,
      numberOfAudioChannels: 2,
      timeSlice: 1000,
      ondataavailable(blob) {
        try {
          transcriptionService.getTranscription({ audio: blob }).then((res) => {
            console.log(res)
            // Iterate through the res and create a Transcription object for each
            //TODO: DO THIS
            transcriptions?.push(res)
            setTranscription(transcriptions)
            setError(null)
          })
        } catch (err: any) {
          setError('Transcription error: ' + err.message)
          setTranscription(null)
          console.error(err)
          console.error(err.message)
        }
      },
    })

    recorder.startRecording()
    setIsRecording(true)

    recorderRef.current = recorder
    transcriptionRef.current = transcriptionService
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    const transcriptionService = transcriptionRef.current
    if (recorder) {
      recorder.stopRecording(() => {
        setIsRecording(false)
      })
    }
    if (transcriptionService) {
      transcriptionService.closeConnection()
    }
  }

  return { isRecording, transcriptions, error, startRecording, stopRecording }
}

export default useTranslator
