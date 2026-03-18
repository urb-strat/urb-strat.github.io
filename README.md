Hello! This is the GitHub repository containing all of the work we (Kelly and Marissa) completed during our time here at USI for the GGR493 internship course.

The main file with the 'home' page is the `index.html` file outside of any file, and as it is right now, contains links to the other `html` pages within the `USIDataset_global` folder and the `new_project_form` folder. 
The project information/data is stored in `USI_projects.geojson`, which I (Kelly) hope can be expanded with more projects outside of Toronto, particularly for the `USIDataset_global` page as that contains a briefer look and map interface of USI projects. 

I coded using separate HTML, JavaScript, and CSS files, and I know it's possible to code them all with HTML but for simplicity's sake and for ease of editing I chose to separate them. The USIDataset_global page/html was done by Marissa, which incorporated all three coding languages into the one HTML file. To separate or not to separate, that is up to whoever works on this next.

The `project_shapes.geojson` and .kml file are imported from google earth, where I searched and dropped pins on the project locations to get their coordinates, and the `toronto_neighbourhoods.geojson` file is for the red background highlighing the municipal boundaries of Toronto. The logo image used in the top left corner of the HTML pages is saved as `usi-logo-fixed.png` -- there were some difficulties with getting the hex colour just right (canva does not support all hex colours, and I can't edit it otherwise), but it is in a decent position. 

One big issue that we didn't quite get to focus on was the `new_project_form`, which only collects data in theory. I put some basic questions that could store data to populate a table of project information, but I can't get it to store the data in a useable format (i.e. a geojson), nor can I figure out how to automate the finding of the coordinates for mapping. 

The code is largely commented to facilitate the review process and explain the code, and all mapbox tokens and styles are based in the USI account.
