# AVANZADO
Gherkin
```
Feature: Aplicación de cupón en el checkout

  Background:
    Given el usuario ha iniciado sesión
    And tiene un producto de $100 en el carrito
    And está en la pantalla de Checkout

  Rule: solo se aplica un cupón por compra

    Scenario: cupón válido con descuento
      When ingresa el cupón "DESC10" y presiona "Aplicar"
      Then el total del carrito es "$90.00"
      And ve el mensaje "Descuento aplicado"
      
    Examples:
      | cupon    | resultado            |
      | DESC10| Descuento aplicado |

    Scenario: intento de aplicar un segundo cupón
      Given ya aplicó el cupón "DESC10"
      When ingresa el cupón "VERANO23" y presiona "Aplicar"
      Then ve el mensaje "Ya hay un cupón aplicado"
    
    Examples:
        | cupon    | resultado            |
        | VERANO23| Ya hay un cupón aplicado |

  Rule: cupones inválidos o expirados no se aplican

    Scenario Outline: cupones rechazados
      When ingresa el cupón "<cupon>" y presiona "Aplicar"
      Then el total del carrito es "$100.00"
      And ve el mensaje "<resultado>"

      Examples:
        | cupon    | resultado            |
        | VERANO23 | El cupón ha expirado |
        | XYZ999   | Cupón no válido      |
# Nota: los mensajes deben mostrarse en el idioma del usuario
```

## Basico-Avanzado