import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { SpeechClient } from '@google-cloud/speech'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

// Create express app
const app = express()
app.use(cors())

// Set up multer for file uploads
const upload = multer()

app.post('/getTranslations', upload.single('file'), async (req, res) => {
  // Extract the model property from the body of the request.
  const model = req.body.model
  // Extract the audio buffer from the request so it can be passed to the next api.
  const audioBuffer = new Blob([req.file.buffer], { type: 'audio/wav' })

  // Check if the required fields are present in the request body
  if (!audioBuffer || !model) {
    return res.status(400).json({ error: 'Missing required fields.' })
  }

  const client = new SpeechClient()

  const config = {
    // encoding: 'WAV_LINEAR16',
    // sampleRateHertz: 16000,
    languageCode: 'en-US',
    audioChannelCount: 2,
  }

  const audio = {
    content: new Uint8Array(await audioBuffer.arrayBuffer()),
  }

  console.log(audio.content)

  const request = {
    config: config,
    audio: audio,
  }

  const [response] = await client.recognize(request)
  const transcription = response.results.map((result) => result.alternatives[0].transcript).join('\n')

  console.log(transcription)

  return res.status(200).json({ message: 'Translation complete.', data: transcription })
})

app.listen(3003, () => {
  console.log('Server is listening on port 3003.')
})
