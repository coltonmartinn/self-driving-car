class TargetEditor extends MarkingEditor {
   constructor(viewport, world) {
      super(viewport, world, () => world.getLaneGuides());
   }

   createMarking(center, directionVector) {
      return new Target(
         center,
         directionVector,
         this.world.roadWidth / 2,
         this.world.roadWidth / 2
      );
   }
}
