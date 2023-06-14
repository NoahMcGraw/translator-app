import express from 'express'
import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'

import GCloudSTTService from './services/gCloudSTTService.js'
import OpenAIService from './services/openAIService.js'

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
  let requestId = 'INIT CONNNECTION'

  // The most up-to-date response from the audio stream. This will be sent to the client on the next websocket message
  let queuedStreamingResponse = null

  // The endpoint that will be called on the websocket message that contains a payload
  let nextEndpointToCall = null

  //Helper to reset state of the nextEndpointToCall
  const resetEndpoint = () => {
    nextEndpointToCall = null
  }

  // If message is a json object, parse it
  /* Helper function to pass responses to the client and track the socket state
   * @param {WebSocket} ws - The websocket connection
   * @param {number} status - The status code to send to the client
   * @param {number} requestId - The requestId to send to the client
   * @param {object} misc - Any other properties to send to the client
   * @returns {void}
   * */
  const respondToClient = (status, misc) => {
    // Generate a nextRequestId
    const nextRequestId = uuidv4()
    console.log('Sending back requestId: ', requestId)
    console.log('Sending back nextRequestId: ', nextRequestId)
    ws.send(JSON.stringify({ status: status, requestId: requestId, nextRequestId: nextRequestId, ...misc }))
    requestId = nextRequestId
  }

  console.log('WebSocket connection established.')

  const gCloudSTTService = new GCloudSTTService()

  const openAIService = new OpenAIService()

  //Send the unique ID to the client so it can be used to match responses to requests
  respondToClient(201)

  ws.on('message', async (message, isBinary) => {
    message = isBinary ? message : message.toString()
    console.log('Message received from client')
    if (typeof message === 'string') {
      try {
        const messageObj = JSON.parse(message)
        // If the message is a json object, it should have a requestId property
        // if (!messageObj.requestId) {
        //   throw new Error('Message does not contain a requestId property')
        // }
        // const messageRequestId = messageObj.requestId
        // If the message requestId does not match the current requestId, throw an error
        // if (messageRequestId !== requestId) {
        //   throw new Error('Message requestId does not match the current requestId')
        // }
        const action = messageObj.action
        switch (action) {
          // If the action is setEndpoint, set the next endpoint to call
          case 'setEndpoint':
            const endpoint = messageObj.data
            if (!endpoint) {
              throw new Error('Message is of action: ' + action + ' and does not contain an endpoint property')
            }
            switch (endpoint) {
              case 'putUserConfigAudio':
                console.log('setting endpoint to putUserConfigAudio')
                nextEndpointToCall = 'putUserConfigAudio'
                // Message the client to start sending audio
                respondToClient(200, { nextEndpointToCall: nextEndpointToCall })
                break
              case 'streamRecognizeAudio':
                console.log('setting endpoint to streamRecognizeAudio')
                nextEndpointToCall = 'streamRecognizeAudio'
                // Message the client to start sending audio
                respondToClient(200, { nextEndpointToCall: nextEndpointToCall })
                break
              default:
                throw new Error('Message is of action: ' + action + ' and contains an invalid endpoint property')
            }
            break
          default:
            throw new Error('Message is of invalid action: ' + action)
        }
      } catch (error) {
        console.log('Error parsing JSON message:', error.message)
        respondToClient(400, { error: 'Error parsing JSON message: ' + error.message })
        return
      }
      // console.log('Received message from client:', message)
    }
    // else if message is a blob, process it
    else if (message instanceof Buffer) {
      try {
        // If the endpoint is not set, throw an error
        if (!nextEndpointToCall) {
          throw new Error('nextEndpointToCall is not set')
        }
        const audioBlob = message

        switch (nextEndpointToCall) {
          case 'putUserConfigAudio':
            // If this is the user config audio, we're going to save the audio to the temp folder and then prepend it to all of our session audio to prime the google speech api
            try {
              gCloudSTTService.putUserConfigAudio(audioBlob)
              // Reset the endpoint to call
              resetEndpoint()
              // Message the client to start sending audio
              respondToClient(200)
            } catch (error) {
              console.log('Error writing user config audio to file:', error.message)
              throw new Error('Error writing user config audio to file: ' + error.message)
            }
            break
          case 'streamRecognizeAudio':
            try {
              let recognizeStream = gCloudSTTService.recognizeStream
              if (!recognizeStream) {
                // If the recognizeStream is not set, create a new one
                gCloudSTTService.createRecognizeStream()
              }
              // console.log('recognizeStream', recognizeStream)
              // console.log('recognizeStream.listenerCount("error")', recognizeStream.listenerCount('error'))
              // console.log('recognizeStream.listenerCount("data")', recognizeStream.listenerCount('data'))
              if (!recognizeStream.listenerCount('error')) {
                recognizeStream.on('error', (error) => {
                  console.error('Error:', error)
                  // return a message to the client indicating an error
                  respondToClient(500, { error: 'Error contacting services, message: ' + error.message })
                })
              }
              if (!recognizeStream.listenerCount('data')) {
                recognizeStream.on('data', speechCallback)
              }
              gCloudSTTService.streamRecognizeAudio(audioBlob)
              // Since this is an async request and we want to give the client a response immediately, we're going to pass them back any queued results that we may have.
              const response = queuedStreamingResponse ? queuedStreamingResponse : {}
              respondToClient(200, response)
              // Reset the queuedStreamingResponse
              queuedStreamingResponse = null
            } catch (error) {
              throw new Error(error)
            }
            break
          default:
            throw new Error('nextEndpointToCall is invalid')
        }
      } catch (error) {
        // Handle JSON parsing error or other processing errors
        console.log('Error processing message:', error.message)
        respondToClient(400, { error: 'Error processing message: ' + error.message })
      }
    }
  })

  const speechCallback = async (res) => {
    console.log('speechCallback called')
    // console.log('Data:', res)
    //console.log('Received data from speech api.')
    if (res.results.length > 0) {
      const result = res.results[0]
      //console.log('resultEndTime: ', result.resultEndTime)
      // Convert API result end time from seconds + nanoseconds to milliseconds
      // resultEndTime = result.resultEndTime.seconds * 1000 + Math.round(result.resultEndTime.nanos / 1000000)
      // console.log('Result:', result)
      // Grab the transcript and wordsInfo from the result
      let transcript = result.alternatives[0].transcript
      console.log('Transcript:', transcript)
      const wordsInfo = result.alternatives[0].words
      // Initialize the completions array
      let completions = []
      // Note: The transcript within each result is separate and sequential per result.
      // However, the words list within an alternative includes all the words
      // from all the results thus far. Thus, to get all the words with speaker
      // tags, you only have to take the words list from the last result:
      // wordsInfo.forEach((a) => console.log(` word: ${a.word}, speakerTag: ${a.speakerTag}`))

      let data = {
        isFinal: result.isFinal,
        transcript: transcript,
        completions: null,
      }

      // If isFinal=true and there is new data to submit, then generate the final transcript and send it to the completions api
      if (result.isFinal) {
        // TODO: write logic where if our current transcript is the same as the previous transcript, then don't send it to the completions api. For some reason the speech api is sending duplicate transcripts marked as final.
        // Generate the final transcript
        const finalTranscript = gCloudSTTService.createTranscript(wordsInfo)
        console.log('Final Transcription:', finalTranscript)
        // Override the transcript with the final transcript
        if (finalTranscript !== undefined && finalTranscript.length > 0) {
          data.transcript = finalTranscript
          // Get the completions
          completions = await openAIService.getCompletions(finalTranscript)
          data.completions = completions
          console.log('Completions:', completions)
        }
      }
      // Set queuedStreamingResponse to data
      queuedStreamingResponse = { data: data }
    }
  }

  ws.on('close', () => {
    console.log('WebSocket connection closed.')
    // Close the connection with the speech API
    gCloudSTTService.closeSTTConnection()
    // Reset the endpoint to call
    resetEndpoint()
  })
})
