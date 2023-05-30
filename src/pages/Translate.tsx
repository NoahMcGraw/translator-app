import React from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonFab,
  IonFabButton,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
  IonText,
  IonSelect,
  IonSelectOption,
} from '@ionic/react'
import { headset } from 'ionicons/icons'
import useTranscriptionRecorder from '../hooks/useTranslator'
import { Languages, LanguagesList } from '../models/Languages.model'

const Translate: React.FC = () => {
  const { isRecording, transcriptions, startRecording } = useTranscriptionRecorder()
  const [languages, setLanguages] = React.useState<Languages[]>([Languages.English, Languages.Spanish])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Translator</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonGrid>
          <IonRow>
            {/* Text results of audio transcription show here*/}
            <IonCol size='12'>
              {/* transcriptionText */}
              {transcriptions &&
                transcriptions.map((transcription, i) => (
                  <IonText key={i}>
                    <h1>{transcription}</h1>
                  </IonText>
                ))}
            </IonCol>
          </IonRow>
        </IonGrid>
        {/* Language select dropdown 1 */}
        <IonFab vertical='bottom' horizontal='start' slot='fixed'>
          {/* Dropdown select input containing options from the LanguagesList */}
          <IonSelect
            value={languages[0]}
            placeholder='Select Language'
            onIonChange={(e) => setLanguages(e.detail.value)}>
            {LanguagesList.map((language: { value: Languages; label: string }, i: number) => (
              <IonSelectOption key={i} value={language.value}>
                {language.label}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonFab>

        {/* Language select dropdown 2 */}
        <IonFab vertical='bottom' horizontal='start' slot='fixed'>
          {/* Dropdown select input containing options from the LanguagesList */}
          <IonSelect
            value={languages[1]}
            placeholder='Select Language'
            onIonChange={(e) => setLanguages(e.detail.value)}>
            {LanguagesList.map((language: { value: Languages; label: string }, i: number) => (
              <IonSelectOption key={i} value={language.value}>
                {language.label}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonFab>
        {/* Record button */}
        <IonFab vertical='bottom' horizontal='center' slot='fixed'>
          <IonFabButton onClick={() => startRecording(languages)}>
            <IonIcon icon={headset}></IonIcon>
            <IonText>{isRecording ? 'Recording...' : 'Record'}</IonText>
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  )
}

export default Translate
