import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'

// Class for handling the user config settings. When uploading a user config audio file, the file chunks should be uploaded via the appendToTempBuffer and then the temp buffer should be written to the user config audio file via the writeTempBufferToUserConfigAudioFile function.
export class ConfigService {
  public static userConfigAudioFileFormat: string = '.webm'

  public static userConfigAudioFilePath: string = '/temp/userConfigAudio' + this.userConfigAudioFileFormat

  private tempBuffer: Uint8Array

  constructor() {
    // Create a new empty buffer.
    this.tempBuffer = new Uint8Array(0)
  }

  // Function that handles uploading the recording. If the audio file already exists, it will be overwritten. If you are recording the audio file
  // public writeDirectlyToUserConfigAudioFile(blob: Blob) {
  //   const fileReader = new FileReader()
  //   fileReader.onload = () => {
  //     const arrayBuffer = fileReader.result as ArrayBuffer
  //     const buffer = Buffer.from(arrayBuffer)
  //     fs.writeFileSync(this.userConfigAudioFilePath, buffer)
  //   }
  //   fileReader.readAsArrayBuffer(blob)
  // }

  public static async configFileExists() {
    try {
      const result = await Filesystem.stat({
        path: ConfigService.userConfigAudioFilePath,
        // directory: Directory.Documents, // or any other directory
      })
      return result.type === 'file'
    } catch (e) {
      return false
    }
  }

  // Function that handles getting the user config audio file.
  public async getUserConfigAudioFile() {
    return await Filesystem.readFile({
      path: ConfigService.userConfigAudioFilePath,
    })
  }

  // Function that handles deleting the user config audio file.
  public async deleteUserConfigAudioFile() {
    await Filesystem.deleteFile({
      path: ConfigService.userConfigAudioFilePath,
    })
  }

  // Assuming this.tempBuffer is a class property and defined as Uint8Array
  public appendToTempBuffer(blob: Blob) {
    const fileReader = new FileReader()
    fileReader.onload = () => {
      const arrayBuffer = fileReader.result as ArrayBuffer
      const tempBuffer = new Uint8Array(arrayBuffer)
      if (this.tempBuffer) {
        let combined = new Uint8Array(this.tempBuffer.byteLength + tempBuffer.byteLength)
        combined.set(this.tempBuffer)
        combined.set(tempBuffer, this.tempBuffer.byteLength)
        this.tempBuffer = combined
      } else {
        this.tempBuffer = tempBuffer
      }
    }
    fileReader.readAsArrayBuffer(blob)
  }

  // Function that handles getting the temp buffer.
  public getTempBuffer() {
    return this.tempBuffer
  }

  // Function that handles deleting the temp buffer.
  public deleteTempBuffer() {
    this.tempBuffer = Buffer.alloc(0)
  }

  public writeTempBufferToUserConfigAudioFile() {
    const reader = new FileReader()
    reader.readAsDataURL(new Blob([this.tempBuffer], { type: 'audio/webm; codecs=opus' }))
    reader.onloadend = () => {
      let base64Data = reader.result
      if (typeof base64Data === 'string') {
        // the result of readAsDataURL includes a MIME-type prefix which should be stripped
        base64Data = base64Data.split(',')[1]
        Filesystem.writeFile({
          path: ConfigService.userConfigAudioFilePath,
          data: base64Data,
        })
      } else {
        throw new Error('Error: base64Data is not a string.')
      }
    }
  }
}
