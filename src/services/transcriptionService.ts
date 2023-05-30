import React from 'react'
import environment from '../environment'
import { waitForVariable } from '../utils'

type GetTranscriptionArgs = {
  audio: Blob
}

export class TranscriptionService extends React.Component {
  private socket: WebSocket

  private nextRequestId: number | undefined = undefined

  // On instance creation, initialize the socket connection
  constructor(props: any) {
    // Call the React.Component constructor() method
    super(props)

    // Create a new WebSocket connection
    this.socket = new WebSocket(environment.API_WS_URL ? environment.API_WS_URL : 'ws://localhost:3003')

    // Event listener for connection open
    this.socket.addEventListener('open', () => {
      console.log('WebSocket connection established.')
    })

    // Event listener for receiving messages
    this.socket.onmessage = (event: MessageEvent) => {
      // console.log('Received message from server:', event.data)
      const response = JSON.parse(event.data)
      const { requestId, nextRequestId } = response

      // Update the nextRequestId, this will be sent with every request including a response from the api on successful connection
      if (nextRequestId) {
        this.nextRequestId = nextRequestId
      }
      // Look up the callback or promise associated with the requestId. This will only not be found if the server is responding to the connection being established.
      if (requestId) {
        const callback = this.requestCallbacks[requestId]
        if (callback) {
          // console.log('Found callback for request id: ', requestId)
          // Invoke the callback or resolve the promise with the response data
          callback.resolve(response)
          delete this.requestCallbacks[requestId]
        }
      }
    }

    // Event listener for connection close
    this.socket.addEventListener('close', () => {
      console.log('WebSocket connection closed.')
    })
  }

  // On instance destruction, close the socket connection
  componentWillUnmount() {
    console.log('WebSocket connection closed.')
    // Close the WebSocket connection
    this.socket.close()
  }

  // Store callbacks and promises associated with requests
  private requestCallbacks: { [requestId: string]: { resolve: Function; reject: Function } } = {}

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

  // Create a promise that will be resolved with the response data
  private createRequestPromise(): Promise<any> {
    // Store the callback or promise associated with the request
    return new Promise<any>(async (resolve, reject) => {
      console.log('Creating request promise')
      // Wait for the socket to be open
      await this.waitForConnection()
      // if nextRequestId is undefined, wait for it to resolve
      await waitForVariable(this.nextRequestId)

      // Store the callback or promise associated with the request
      if (this.nextRequestId) {
        console.log('Creating request promise for request id: ', this.nextRequestId)
        resolve((this.requestCallbacks[this.nextRequestId] = { resolve, reject }))
      } else {
        reject('No next request id')
      }
    })
  }

  // Send a request to the server and return a promise that will be resolved with the response data
  private sendRequest(request: any): Promise<any> {
    // Create a promise that will be resolved with the response data
    return new Promise<any>((resolve, reject) => {
      // If the socket is open, send the request message
      this.createRequestPromise()
        .then(() => {
          console.log('Sending request: ', request)
          this.socket.send(request)
          // Resolve the promise with the response data
          if (this.nextRequestId) {
            this.requestCallbacks[this.nextRequestId] = { resolve, reject }
          } else {
            reject('No next request id')
          }
        })
        .catch((error: any) => {
          reject(new Error(error))
        })
    })
  }
  // Get the transcriptions for the given audio file
  public async getTranscription(args: GetTranscriptionArgs): Promise<string> {
    // Check that formData has the correct keys
    if (!args.audio) {
      throw new Error('Invalid form data')
    }

    // Set the audioBlob as the request
    const request = args.audio

    // Send the request to the server
    return new Promise<string>((resolve, reject) => {
      this.sendRequest(request)
        .then((response: any) => {
          // Handle the response data
          console.log('Response: ', response)
          const { status, data } = response
          console.log('Status: ', status)
          console.log('Data: ', data)
          if (status === 200 && data) {
            resolve(data)
          } else {
            // Handle errors
            reject(
              new Error(
                'Server status: ' +
                  response.status +
                  '\n Error getting transcriptions: ' +
                  (response.error ? response.error : 'Unspecified error')
              )
            )
          }
        })
        .catch((error: any) => {
          // Handle errors
          reject(new Error(error))
        })
    })
  }
}
export default TranscriptionService
