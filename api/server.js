import express from 'express'
import { WebSocketServer } from 'ws'
import { SpeechClient } from '@google-cloud/speech/build/src/v1p1beta1/speech_client.js'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

// Create express app
const app = express()

const server = app.listen(3003, () => {
  console.log('Server is listening on port 3003.')
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  // Generate a unique ID for this WebSocket connection
  let requestId = uuidv4()

  console.log('WebSocket connection established.')

  //Send the unique ID to the client so it can be used to match responses to requests
  ws.send(JSON.stringify({ status: 201, nextRequestId: requestId, requestId: undefined }))

  ws.on('message', async (message) => {
    console.log('Received message from client:', message)

    try {
      const audioBlob = message

      // console log the endpoint, requestId, and data
      console.log('Request ID:', requestId)
      console.log('Data:', audioBlob)

      // Process the data payload
      const transcription = await getTranscriptions(audioBlob)
      // Generate a new unique ID for the next request
      const nextRequestId = uuidv4()
      // Send a response to the client
      ws.send(JSON.stringify({ status: 200, requestId: requestId, nextRequestId: nextRequestId, data: transcription }))
      // Update the requestId to the new ID
      requestId = nextRequestId

      // Additional endpoint handling as needed
    } catch (error) {
      // Handle JSON parsing error or other processing errors
      console.log('Error processing message:', error.message)
      ws.send(
        JSON.stringify({ status: 400, requestId: requestId, error: 'Error processing message: ' + error.message })
      )
    }
  })

  ws.on('close', () => {
    console.log('WebSocket connection closed.')
  })
})

const getTranscriptions = async (audioBlob) => {
  // Extract the audio buffer from the request so it can be passed to the next api.
  // const audioBuffer = new Blob([req.file], { type: 'audio/wav' })

  // Check if the required fields are present in the request body
  // if (!audioBuffer) {
  //   throw new Error('Missing required fields.')
  // }

  const client = new SpeechClient()

  const config = {
    encoding: 'WAV_LINEAR16',
    // sampleRateHertz: 16000,
    languageCode: 'en-US',
    // alternativeLanguageCodes: ['es-ES', 'en-US'],
    audioChannelCount: 2,
    enableSpeakerDiarization: true,
    enableAutomaticPunctuation: true,
    minSpeakerCount: 2,
    maxSpeakerCount: 4,
  }

  const audio = {
    // content: new Uint8Array(await audioBlob.arrayBuffer()),
    content: audioBlob,
  }

  const request = {
    config: config,
    audio: audio,
  }

  let transcription = ''

  try {
    const [response] = await client.recognize(request)
    transcription = response.results.map((result) => result.alternatives[0].transcript).join('\n')
    console.log('Results:', response.results)
    console.log(`Transcription: ${transcription}`)
    console.log('Speaker Diarization:')
    const result = response.results[response.results.length - 1]
    const wordsInfo = result.alternatives[0].words
    // Note: The transcript within each result is separate and sequential per result.
    // However, the words list within an alternative includes all the words
    // from all the results thus far. Thus, to get all the words with speaker
    // tags, you only have to take the words list from the last result:
    wordsInfo.forEach((a) => console.log(` word: ${a.word}, speakerTag: ${a.speakerTag}`))
  } catch (error) {
    throw new Error(error)
  }

  return transcription
}
