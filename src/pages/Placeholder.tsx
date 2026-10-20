import { Card, Screen } from '../ui/Screen'

/** Telas ainda não implementadas: mostram o que virá, para o esqueleto já poder ser avaliado no celular. */
export default function Placeholder({ title, next }: { title: string; next: string }) {
  return (
    <Screen title={title}>
      <Card className="border-dashed text-sm text-muted">
        <p>{next}</p>
      </Card>
    </Screen>
  )
}
