Feature: Compra con usuario registrado
  @ATS_006
  Scenario Outline: Compra con usuario registrado
    Given el carrito tiene un artículo
    # Paso compartido: Iniciar sesión (v4)
    When estoy en la página de acceso
    And escribo <usuario> y <clave> y pulso «Entrar»
    And pago el pedido
    Then El pedido queda «Confirmado»

    # Dataset: Usuarios válidos (v2)
    Examples:
      | usuario | clave |
      | ana@acme.test | Clave-1 |
      | luis@acme.test | Clave-2 |
      | admin@acme.test | Clave-3 |
