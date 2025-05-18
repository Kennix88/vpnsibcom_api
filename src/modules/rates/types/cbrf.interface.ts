/**
 * Интерфейс для отдельной валюты в ответе ЦБ РФ
 */
export interface CBRFValuteInterface {
  /** Идентификатор валюты */
  ID: string;
  /** Цифровой код валюты */
  NumCode: string;
  /** Буквенный код валюты */
  CharCode: string;
  /** Номинал */
  Nominal: number;
  /** Название валюты */
  Name: string;
  /** Значение курса */
  Value: string;
  /** Значение курса за единицу */
  VunitRate: string;
}

/**
 * Интерфейс для корневого элемента ответа ЦБ РФ
 */
export interface CBRFResponseInterface {
  ValCurs: {
    /** Дата курса */
    $: {
      Date: string;
      name: string;
    };
    /** Список валют */
    Valute: CBRFValuteInterface[];
  };
}