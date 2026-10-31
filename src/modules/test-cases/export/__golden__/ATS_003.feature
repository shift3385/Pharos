@REQ-009
Feature: Checkout completo

  Background:
    Given la tienda está abierta
    And precios en EUR

  @ATS_003 @smoke
  Scenario: Pago correcto
    Given un carrito
    When pago
    And confirmo
    Then pagado

  @ATS_003
  Scenario Outline: Tarjeta rechazada
    When pago con <card>
    Then rechazado

    Examples:
      | card |
      | caducada |
      | robada |
