import axios from 'axios'
// import { Languages } from '../models/Languages.model'
// import { Translations } from '../models/Translations.model'

type GetTranscriptionArgs = {
  audio: Blob
}

export class TranslatorService {
  // Get the transcriptions for the given audio file
  public static async getTranscription(args: GetTranscriptionArgs): Promise<string> {
    // Check that formData has the correct keys
    if (!args.audio) {
      throw new Error('Invalid form data')
    }
    const audioBlob = args.audio
    const requestData = new FormData()
    requestData.append('file', audioBlob, 'audio.webm')
    requestData.append('model', 'whisper-1')

    const config = {
      method: 'post',
      url: 'http://localhost:3003/getTranslations',
      headers: {
        Accept: '*/*',
      },
      data: requestData,
    }

    return await axios(config)
      .then(function (res) {
        console.log(JSON.stringify(res.data))
        return JSON.stringify(res.data)
      })
      .catch(function (error) {
        console.log(error)
        return error
      })
  }

  // public static async getTranslation(formData: FormData): Promise<Translations> {
  //   // Check that formData has the correct keys
  //   if (!formData.has('audio') || !formData.has('languages')) {
  //     throw new Error('Invalid form data')
  //   }
  //   let languagesRaw = formData.get('languages') as string
  //   if (!languagesRaw) {
  //     throw new Error('Invalid form data')
  //   }
  //   const languages = languagesRaw.split(',')
  //   const audioBlob = new Blob([formData.get('audio') as BlobPart], { type: 'audio/wav' })

  //   // Define the API endpoint
  //   const apiUrl: string = 'https://api.openai.com/v1/completions'

  //   // Define the bilingual text to translate
  //   const text: string =
  //     "Greetings. Hello. Hola. Hola. Nice to meet you. Gusto en conocerlo. Gusto en conocerlo. The pleasure is mine. El gusto es mio. El gusto es mio. Good morning. Buenos dias. Buenos dias. Good afternoon. Buenas tardes. Buenas tardes. Good night. Buenas noches. Buenas noches. See you tomorrow. Hasta mañana. Hasta mañana. We'll see you. Nos vemos. Nos vemos. See you soon. Hasta pronto. Hasta pronto. It has been a pleasure. Ha sido un placer. Ha sido un placer. Likewise. Igualmente. Igualmente. Goodbye. Adios. Adios. How are you? ¿Cómo está? ¿Cómo está? How have you been? ¿Cómo ha estado? ¿Cómo ha estado? How is your family? ¿Cómo está su familia? ¿Cómo está su familia? You are welcome. De nada. De nada. Very well. Thank you. Muy bien. Gracias."

  //   // Define the model to use
  //   const modelEngine: string = 'text-davinci-002'

  //   // Define the prompt
  //   const prompt: string = `Please translate the following bilingual text into Spanish and English:

  //   ${text}

  //   English:

  //   `

  //   // Define the data to send in the API request
  //   interface RequestData {
  //     prompt: string
  //     max_tokens: number
  //     temperature: number
  //     n: number
  //     stop: string
  //   }

  //   const requestData: RequestData = {
  //     prompt,
  //     max_tokens: 2048,
  //     temperature: 0,
  //     n: 1,
  //     stop: '\n\n',
  //   }

  //   // Define the headers to send in the API request
  //   interface RequestHeaders {
  //     'Content-Type': string
  //     Authorization: string
  //   }

  //   const requestHeaders: RequestHeaders = {
  //     'Content-Type': 'application/json',
  //     Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  //   }

  //   // Make the API request using Axios
  //   axios
  //     .post(apiUrl, requestData, { headers: requestHeaders })
  //     .then((response: AxiosResponse<{ choices: { text: string }[] }>) => {
  //       // Get the generated translations
  //       const translations: { text: string }[] = response.data.choices[0].text
  //         .trim()
  //         .split('\n\n')
  //         .map((translation: string) => JSON.parse(translation))

  //       // Log the translations
  //       console.log(translations)
  //     })
  //     .catch((error: Error) => {
  //       // Log any errors
  //       console.error(error)
  //     })
  // }
}
export default TranslatorService
