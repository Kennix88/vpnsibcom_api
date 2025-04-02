import { Scenes } from 'telegraf'

export interface Context extends Scenes.SceneContext {
  session: Scenes.SceneSession & {
    a: string
  }
}

export interface WizardContext extends Scenes.WizardContext {
  session: Scenes.WizardSession & {
    a: string
  }
}
