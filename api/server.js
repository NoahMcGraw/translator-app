import express from 'express'
import { WebSocketServer } from 'ws'

import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
// import { SpeechClient } from '@google-cloud/speech/build/src/v1p1beta1/speech_client.js'
import { SpeechClient } from '@google-cloud/speech'

// Load environment variables from .env file
dotenv.config()

// Create express app
const app = express()

const server = app.listen(3003, () => {
  console.log('Server is listening on port 3003.')
})

const wss = new WebSocketServer({ server })

let speechClient = null
let recognizeStream = null
// Generate a unique ID for this WebSocket connection
let requestId = uuidv4()

wss.on('connection', (ws) => {
  console.log('WebSocket connection established.')

  //Send the unique ID to the client so it can be used to match responses to requests
  ws.send(JSON.stringify({ status: 201, nextRequestId: requestId, requestId: undefined }))

  ws.on('message', async (message) => {
    // console.log('Received message from client:', message)

    try {
      const audioBlob = message

      // console log the endpoint, requestId, and data
      // console.log('Request ID:', requestId)
      // console.log('Data:', audioBlob)

      // Process the data payload
      await sendAudioChunk(audioBlob)
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
    // Close the connection with the speech API
    closeRecognizeStream()
  })
})

const sendAudioChunk = async (audioChunk) => {
  try {
    if (!speechClient) {
      // Create a new client
      speechClient = new SpeechClient()

      // Configure the streaming request
      const request = {
        config: {
          model: 'video',
          useEnhanced: true,
          encoding: 'LINEAR16',
          sampleRateHertz: 44100,
          audioChannelCount: 2,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          diarizationConfig: {
            enableSpeakerDiarization: true,
            minSpeakerCount: 2,
            maxSpeakerCount: 4,
          },
        },
        interimResults: true, // Enable interim (partial) results
      }

      // Start the streaming recognition
      // console.log(typeof speechClient.streamingRecognize)
      recognizeStream = speechClient
        .streamingRecognize(request)
        .on('error', (error) => {
          console.error('Error:', error)
        })
        .on('data', (data) => {
          console.log('Data:', data)
          if (data.results.length > 0) {
            const result = data.results[0]
            const transcription = result.alternatives[0].transcript
            const wordsInfo = result.alternatives[0].words
            // Note: The transcript within each result is separate and sequential per result.
            // However, the words list within an alternative includes all the words
            // from all the results thus far. Thus, to get all the words with speaker
            // tags, you only have to take the words list from the last result:
            wordsInfo.forEach((a) => console.log(` word: ${a.word}, speakerTag: ${a.speakerTag}`))
            console.log('Partial Transcription:', transcription)
            // Generate a new unique ID for the next request
            const nextRequestId = uuidv4()
            wss.clients.forEach((client) => {
              client.send(
                JSON.stringify({ status: 200, requestId: requestId, nextRequestId: nextRequestId, data: transcription })
              )
            })
          }
        })
    }
    // console.log('RecognizeStream', recognizeStream)

    // Write the audio chunk to the streaming request
    recognizeStream.write(audioChunk)
  } catch (error) {
    console.error('Error sending audio chunk:', error)
  }
}

// Helper function for closing the connection with the speech API
const closeRecognizeStream = async () => {
  if (recognizeStream) {
    await recognizeStream.destroy()
    recognizeStream = null
    console.log('RecognizeStream closed.')
  }
  if (speechClient) {
    await speechClient.close()
    speechClient = null
    console.log('SpeechClient closed.')
  }
}
