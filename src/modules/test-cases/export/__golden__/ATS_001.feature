@REQ-001 @REQ-002 @checkout
Feature: Pagar con tarjeta
  @ATS_001 @smoke @ui
  Scenario: Pagar con tarjeta
    Given Usuario registrado
    And Carrito con 2 artículos
    When Abrir el carrito
    And Pagar
    And Confirmar <importe>
    Then Pedido creado
    And Correo enviado
