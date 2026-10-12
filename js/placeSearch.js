// Wires up a search box: type a place, pick a result, get { name, lat, lon, radius }
class PlaceSearch {
   constructor({ form, input, sizeSelect, results, onPick, onStatus = () => {} }) {
      this.form = form;
      this.input = input;
      this.sizeSelect = sizeSelect;
      this.results = results;
      this.onPick = onPick;
      this.onStatus = onStatus;

      form.addEventListener("submit", (evt) => {
         evt.preventDefault();
         this.search(input.value);
      });
      document.addEventListener("click", (evt) => {
         if (!form.contains(evt.target)) {
            this.#hideResults();
         }
      });
   }

   async search(query) {
      query = query.trim();
      if (!query) {
         this.input.focus();
         return;
      }
      this.input.value = query;
      this.#showMessage("Searching…");
      let places;
      try {
         places = await Places.search(query);
      } catch (e) {
         this.#showMessage("Search failed: " + e.message);
         return;
      }
      if (places.length == 0) {
         this.#showMessage("No places found. Try adding a state or country.");
         return;
      }
      if (places.length == 1) {
         this.#pick(places[0]);
         return;
      }
      this.results.innerHTML = "";
      for (const place of places) {
         const button = document.createElement("button");
         button.type = "button";
         button.innerHTML = "<span class='icon'>📍</span>";
         button.append(place.name);
         button.addEventListener("click", () => this.#pick(place));
         this.results.append(button);
      }
      this.results.style.display = "block";
   }

   #pick(place) {
      this.#hideResults();
      this.input.value = Places.shortName(place.name);
      this.onPick({
         ...place,
         radius: Places.SIZES[this.sizeSelect.value] || Places.SIZES.medium,
      });
   }

   #showMessage(text) {
      this.results.innerHTML = "";
      const div = document.createElement("div");
      div.className = "message";
      div.textContent = text;
      this.results.append(div);
      this.results.style.display = "block";
   }

   #hideResults() {
      this.results.style.display = "none";
   }
}
