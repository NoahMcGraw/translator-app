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
import useTranslationRecorder from '../hooks/useTranslator'
import { Languages, LanguagesList } from '../models/Languages.model'

const Translate: React.FC = () => {
  const { isRecording, translationTexts, startRecording } = useTranslationRecorder()
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
            {/* Text results of audio translation show here*/}
            <IonCol size='12'>
              {/* translationText */}
              {translationTexts &&
                translationTexts.map((translations, i) => (
                  <IonText key={i}>
                    <h1>{translations.language}</h1>
                    <p>{translations.text}</p>
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
