<h1>DICE</h1>

<h2>Background on the DICE Models</h2>

<p>The great American scientist Willard Gibbs said, "Mathematics is language." Today, models are the language of science. Whether you are piloting a superjumbo jet, reading a medical scan, or looking at your Facebook page, behind the scene is a model that designed your experience.</p>

<p>The DICE model is an example of how models are used in climate science and policy. It is an integrated assessment computerized model that pulls together economics and science to help understand the dynamics and policy aspects of climate change.</p>

<p>Other descriptions and earlier models and results can be found on the author's web site: http://www.econ.yale.edu/~nordhaus/homepage/index.html.</p>

<p>For a longer description, see the User's Manual for DICE-2013R, Second edition, by William Nordhaus with Paul Sztorc (2013), available in the documentation folder.</p>

<p>For those who are beginning their journey, bon voyage!</p>

<h2>Reimplementations in this fork</h2>

<ul>
<li><code>reference/</code>: the GAMS solutions embedded in the Excel workbook, extracted to JSON (the ground truth for all tests).</li>
<li><code>python/</code>: a Python/Pyomo/Ipopt transcription of <code>DICE2013R_110513_vanilla.gms</code>, tested equation by equation against GAMS. See <code>python/README.md</code>.</li>
<li><code>web/</code>: an interactive browser version that solves the model live as you change assumptions, tested against GAMS, the Python version, and in a real browser. See <code>web/README.md</code>.</li>
</ul>

<p>All tests run in GitHub Actions on every push and pull request (<code>.github/workflows/ci.yml</code>).</p>
