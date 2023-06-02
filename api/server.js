import express from 'express'
import fs from 'fs'
import { WebSocketServer } from 'ws'
// import * as revai from 'revai-node-sdk'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
// import { SpeechClient } from '@google-cloud/speech/build/src/v1p1beta1/speech_client.js'
import { SpeechClient } from '@google-cloud/speech'
import { Configuration, OpenAIApi } from 'openai'

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

let openai = null

// String that will store the context of the conversation.
// For now, it is hardcoded to a conversation between two people. This filler text will be replaced with the actual conversation after the initial message is sent.
let completionsContext = ''

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
      // initialize client with audio configuration and access token
      // const audioConfig = new revai.AudioConfig(
      //   /* contentType */ 'audio/x-wav',
      //   /* layout */ 'non-interleaved',
      //   /* sample rate */ 44100,
      //   /* format */ 'S16LE',
      //   /* channels */ 2
      // )

      // // optional config to be provided.
      // const sessionConfig = new revai.SessionConfig(
      //   null /* (optional) metadata */,
      //   null /* (optional) custom_vocabulary_id */,
      //   false /* (optional) filter_profanity */,
      //   false /* (optional) remove_disfluencies */,
      //   0 /* (optional) delete_after_seconds */,
      //   0 /* (optional) start_ts */,
      //   'machine_v2' /* (optional) transcriber */,
      //   false /* (optional) detailed_partials */,
      //   'en',
      //   false,
      //   true
      // )

      // Create a new client
      // speechClient = new revai.RevAiStreamingClient(process.env.REV_API_KEY, audioConfig)

      // recognizeStream = speechClient
      //   .start(sessionConfig)
      //   .on('error', (error) => {
      //     console.error('Error:', error)
      //   })
      //   .on('data', (data) => {
      //     console.log('Data:', data)
      //     // if (data.results.length > 0) {
      //     //   const result = data.results[0]
      //     //   const transcription = result.alternatives[0].transcript
      //     //   const wordsInfo = result.alternatives[0].words
      //     //   // Note: The transcript within each result is separate and sequential per result.
      //     //   // However, the words list within an alternative includes all the words
      //     //   // from all the results thus far. Thus, to get all the words with speaker
      //     //   // tags, you only have to take the words list from the last result:
      //     //   wordsInfo.forEach((a) => console.log(` word: ${a.word}, speakerTag: ${a.speakerTag}`))
      //     //   console.log('Partial Transcription:', transcription)
      //     //   // Generate a new unique ID for the next request
      //     //   const nextRequestId = uuidv4()
      //     //   wss.clients.forEach((client) => {
      //     //     client.send(
      //     //       JSON.stringify({ status: 200, requestId: requestId, nextRequestId: nextRequestId, data: transcription })
      //     //     )
      //     //   })
      //     // }
      //   })

      // Create a new client
      speechClient = new SpeechClient()

      // Configure the streaming request
      const request = {
        config: {
          model: 'video',
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          audioChannelCount: 1,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          diarizationConfig: {
            enableSpeakerDiarization: true,
            minSpeakerCount: 2,
            maxSpeakerCount: 3,
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
        .on('data', async (res) => {
          // console.log('Data:', res)
          if (res.results.length > 0) {
            const result = res.results[0]
            // Grab the transcript and wordsInfo from the result
            let transcript = result.alternatives[0].transcript
            const wordsInfo = result.alternatives[0].words
            // Initialize the completions array
            let completions = []
            // Note: The transcript within each result is separate and sequential per result.
            // However, the words list within an alternative includes all the words
            // from all the results thus far. Thus, to get all the words with speaker
            // tags, you only have to take the words list from the last result:
            // wordsInfo.forEach((a) => console.log(` word: ${a.word}, speakerTag: ${a.speakerTag}`))

            // If isFinal=true, then generate the final transcript and send it to the completions api
            if (result.isFinal) {
              // Generate the final transcript
              const finalTranscript = createTranscript(wordsInfo)
              console.log('Final Transcription:', finalTranscript)
              // Override the transcript with the final transcript
              transcript = finalTranscript
              // Get the completions
              completions = await getCompletions(finalTranscript)
              console.log('Completions:', completions)
            }
            const data = {
              isFinal: result.isFinal,
              transcript: transcript,
              completions: completions,
            }
            // Generate a new unique ID for the next request
            const nextRequestId = uuidv4()
            wss.clients.forEach((client) => {
              client.send(
                JSON.stringify({ status: 200, requestId: requestId, nextRequestId: nextRequestId, data: data })
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
    // await speechClient.end()
    speechClient = null
    console.log('SpeechClient closed.')
  }
}

// Helper function for creating a transcript from the words array returned by the speech API
const createTranscript = (words) => {
  let transcript = ''
  let currentSpeaker = 1
  let currentWord = ''
  words.forEach((word) => {
    if (word.speakerTag === currentSpeaker) {
      currentWord = currentWord + ' ' + word.word
    } else {
      transcript = transcript + '[Speaker ' + currentSpeaker + '] ' + currentWord + '\n'
      currentSpeaker = Number(word.speakerTag)
      currentWord = word.word
    }
  })
  transcript = transcript + '[Speaker ' + currentSpeaker + '] ' + currentWord + '\n'
  return transcript
}

const getCompletions = async (transcript) => {
  if (!openai) {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    })

    openai = new OpenAIApi(configuration)
  }

  // If there is no context yet, then we need to grab the example context from completionsContext.json and then overwrite it with actual conversation history later
  let overwriteContext = false
  let response = []

  try {
    // If there is no context yet, then grab the example context from completionsContext.json
    if (completionsContext === '') {
      overwriteContext = true
      const completionsContextJSON = fs.readFileSync('completionsContext.json', 'utf8')
      try {
        completionsContext = JSON.parse(completionsContextJSON).text
      } catch (error) {
        console.error('Error parsing completionsContextJSON:', error)
        throw new Error('Error parsing completionsContextJSON')
      }
    }
    const responseObj = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: completionsContext + transcript + '\n[Generated Opts]',
      temperature: 0.5,
      max_tokens: 60,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0,
      stop: ['[Speaker 1]', '[Speaker 2]', '[Generated Opts]'],
    })
    console.log('Response:', responseObj)
    const completions = responseObj.data.choices[0].text
    console.log('Completions:', completions)
    // if overwriteContext is true, then overwrite the context with the actual conversation history
    if (overwriteContext) {
      completionsContext = transcript + '\n[Generated Opts]' + completions
      console.log('Overriding Completions Context:', completionsContext)
    }
    response = completions.split('\n')
    console.log('Response:', response)
  } catch (error) {
    console.log(error)
    throw new Error(error)
  }

  return response
}
