// import { request } from 'http'
import React from 'react'
import environment from '../environment'
import { waitForVariable } from '../utils'

type GetTranscriptionArgs = {
  audio: Blob
}

export class TranscriptionService extends React.Component {
  private socket: WebSocket

  private socketState: {
    nextEndpointToCall: string | undefined
    nextRequestId: number | undefined
  }

  // Store callbacks and promises associated with requests
  private requestCallbacks: { [requestId: string]: { resolve: Function; reject: Function } } = {}

  // Queue of requests to be sent to the server
  private serverRequestQueue: any[] = []

  // On instance creation, initialize the socket connection
  constructor(props: any) {
    // Call the React.Component constructor() method
    super(props)

    // Create a new WebSocket connection
    this.socket = new WebSocket(environment.API_WS_URL ? environment.API_WS_URL : 'ws://localhost:3003')

    this.socketState = {
      nextEndpointToCall: undefined,
      nextRequestId: undefined,
    }

    // Event listener for connection open
    this.socket.addEventListener('open', () => {
      console.log('WebSocket connection established.')
    })

    // Event listener for receiving messages
    this.socket.onmessage = (event: MessageEvent) => {
      // console.log('Received message from server:', event.data)
      const response = JSON.parse(event.data)
      const { requestId, nextRequestId, nextEndpointToCall } = response

      // Update the nextRequestId, this will be sent with every request including a response from the api on successful connection
      if (nextRequestId) {
        this.socketState.nextRequestId = nextRequestId
      }

      // Update the nextEndpointToCall, This can be expected in the response to a setEndpoint request but may be sent by the api at any time
      if (nextEndpointToCall) {
        // console.log('Setting next endpoint to call: ', nextEndpointToCall)
        this.socketState.nextEndpointToCall = nextEndpointToCall
      }

      // Look up the callback or promise associated with the requestId. This will only not be found if the server is responding to the connection being established.
      console.log('requestId returned by server:', requestId)
      console.log('requestCallbacks:', this.requestCallbacks[requestId])
      if (requestId && this.requestCallbacks[requestId] !== undefined) {
        console.log('requestId and requestCallback set. Promise:', this.requestCallbacks[requestId])
        const requestCallback = this.requestCallbacks[requestId]

        // console.log if the requestCallback is already resolved

        // Handle the response data
        if (response.error) {
          requestCallback.reject(new Error(response.error))
        } else {
          console.log('Resolving requestCallback with response.data:', response)
          requestCallback.resolve(response)
        }

        delete this.requestCallbacks[requestId]
      }
    }

    // Event listener for connection close
    this.socket.addEventListener('close', () => {
      console.log('WebSocket connection closed.')
    })
  }

  // On instance destruction, close the socket connection
  componentWillUnmount() {
    this.closeConnection()
  }

  public closeConnection() {
    // Close the WebSocket connection
    this.socket.close()
    // Reset the socket state
    this.resetSocketState()
  }

  private resetSocketState() {
    this.socketState = {
      nextEndpointToCall: undefined,
      nextRequestId: undefined,
    }
  }

  // Helper function to wait for the socket to be open
  private async waitForConnection(maxTimeOut: number = 100): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      let curTimeOut = 0
      const intervalId = setInterval(() => {
        if (this.socket.readyState === WebSocket.OPEN) {
          clearInterval(intervalId)
          resolve(true)
        } else if (curTimeOut < maxTimeOut) {
          curTimeOut++
        } else {
          reject('Timed out waiting for socket connection')
        }
      }, 100) // Adjust the interval duration as needed
    })
  }

  // Create a promise that will be resolved with the next request ID
  private createRequestPromise(): Promise<any> {
    return new Promise<any>(async (outerResolve, outerReject) => {
      await this.waitForConnection()
      await waitForVariable(this.socketState.nextRequestId, 50)

      if (this.socketState.nextRequestId) {
        const requestId = this.socketState.nextRequestId
        console.log('Creating request promise with request ID:', requestId)
        const innerPromise = new Promise((innerResolve, innerReject) => {
          this.requestCallbacks[requestId] = {
            resolve: innerResolve,
            reject: innerReject,
          }
        })

        outerResolve({ requestPromise: innerPromise }) // Resolve with the new promise
      } else {
        outerReject('No next request id')
      }
    })
  }

  /**
   * Send a request to the server and return a promise that will be resolved with the response from the server. If the socket is not open or the nextRequestId hasn't been returned yet, the request will be queued and sent when the socket is open.
   * @param request The request object
   * @returns A promise that will be resolved with the response from the server
   */
  private async sendRequest(request: any): Promise<any> {
    // Push the request obj to the serverRequestQueue
    // this.serverRequestQueue.push(request)
    return new Promise((resolve, reject) => {
      this.createRequestPromise()
        .then((createResponse) => {
          // Pull the first request from the serverRequestQueue
          // const queuedRequest = this.serverRequestQueue.shift()
          // Send the request to the server
          this.socket.send(request)
          // Set nextRequestId to undefined
          // this.socketState.nextRequestId = undefined
          resolve(createResponse)
        })
        .catch((error: any) => {
          reject(error)
        })
    })
  }

  private counter = 0
  // Get the transcriptions for the given audio file
  public async getTranscription(args: GetTranscriptionArgs): Promise<string> {
    // Check that formData has the correct keys
    if (!args.audio) {
      throw new Error('Invalid form data')
    }

    const audio = args.audio

    // Send the request to the server
    return new Promise<any>(async (resolve, reject) => {
      const locCounter = this.counter++
      // Send a message to the server that our next request will be a transcription request
      if (this.socketState.nextEndpointToCall !== 'streamRecognizeAudio') {
        this.setEndpoint('streamRecognizeAudio')
          .then(() => {
            // Send the request to the server
            // console.log('Sending request to streamRecognizeAudio')
            console.log('callback from setEndpoint', locCounter)
            this.doGetCompletions(audio)
              .then((data) => {
                resolve(data)
              })
              .catch((error) => {
                throw new Error(error)
              })
          })
          .catch((error: any) => {
            reject(new Error(error))
          })
      } else {
        // Send the request to the server
        // console.log('Sending request to streamRecognizeAudio')
        console.log('skipped setEndpoint', locCounter)
        this.doGetCompletions(audio)
          .then((data) => {
            resolve(data)
          })
          .catch((error) => {
            throw new Error(error)
          })
      }
    })
  }

  // Set the endpoint to call for the next request
  private setEndpoint(endpoint: string): Promise<true | Error> {
    // Send the request to the server
    return new Promise<true | Error>((resolve, reject) => {
      this.sendRequest(JSON.stringify({ action: 'setEndpoint', data: endpoint }))
        .then((sendResponse: { requestPromise: Promise<any> }) => {
          const { requestPromise } = sendResponse
          requestPromise
            .then((response: any) => {
              console.log('response from setEndpoint', response)
              // Handle the response data
              const { status, nextEndpointToCall } = response
              if (status === 200 && nextEndpointToCall === endpoint) {
                resolve(true)
                // Check if the response contains the correct endpoint value
              } else {
                reject(new Error('Endpoint not set correctly'))
              }
            })
            .catch((error: any) => {
              // Handle errors
              reject(new Error(error))
            })
        })
        .catch((error: any) => {
          // Handle errors
          reject(new Error(error))
        })
    })
  }

  private async doGetCompletions(audio: Blob): Promise<any> {
    // Set the audioBlob as the request
    const request = audio

    // Send the request to the server
    return new Promise((resolve, reject) => {
      this.sendRequest(request)
        .then((sendResponse: { requestPromise: Promise<any> }) => {
          const { requestPromise } = sendResponse
          requestPromise
            .then((response: any) => {
              console.log('response from doGetCompletions', response)
              // Handle the response data
              const { status, error } = response
              let { data } = response
              if (status === 200) {
                data = data ? data : 'pending'
                resolve(data)
                // Check if the response contains the correct endpoint value
              } else {
                reject(new Error('Error Status: ' + status + ' Error: ' + error))
              }
            })
            .catch((error: any) => {
              // Handle errors
              reject(new Error(error))
            })
        })
        .catch((error: any) => {
          // Handle errors
          reject(new Error(error))
        })
    })
  }
}
export default TranscriptionService
