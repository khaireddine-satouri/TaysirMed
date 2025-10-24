import RendezVousList from '../medecin/RendezVousList';

// ...
<MedecinLayout>
  <RendezVousList
    onOpenPatient={(id) => console.log('open patient', id)}
    onOpenConsultation={(id) => console.log('open consult', id)}
  />
</MedecinLayout>
